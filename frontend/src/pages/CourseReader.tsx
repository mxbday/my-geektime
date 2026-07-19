import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, List, Menu, PanelRight, X } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArticleItem, getArticleInfo, getProductArticles } from '@/api/product'
import { getTaskInfo, getTaskList, TaskItem } from '@/api/task'
import { Spinner } from '@/components/ui'

interface OutlineItem {
  id: string
  text: string
  level: number
}

interface ReaderArticle {
  id: string | number
  title: string
  summary?: string
}

const getVideoUrl = (detail: any) => {
  if (detail?.play_url && detail?.is_video) return detail.play_url
  const medias = detail?.video?.hls_medias || detail?.video_preview?.medias || []
  return medias.length ? medias[medias.length - 1].url : ''
}

const getAudioUrl = (detail: any) => {
  if (detail?.play_url && !detail?.is_video) return detail.play_url
  return detail?.audio?.url || ''
}

const mapProductArticle = (article: ArticleItem): ReaderArticle => ({
  id: article.id,
  title: article.article_title,
  summary: article.article_summary,
})

const mapTaskArticle = (task: TaskItem): ReaderArticle => ({
  id: task.task_id,
  title: task.task_name,
  summary: task.subtitle === '无' ? undefined : task.subtitle,
})

export const CourseReader: React.FC = () => {
  const { productId = '', articleId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const contentRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<any>(null)
  const [articles, setArticles] = useState<ReaderArticle[]>([])
  const [articleDetail, setArticleDetail] = useState<any>(null)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const isTaskReader = location.pathname.startsWith('/task/read/')

  const currentIndex = useMemo(
    () => articles.findIndex((article) => String(article.id) === articleId),
    [articles, articleId],
  )
  const currentArticle = currentIndex >= 0 ? articles[currentIndex] : null

  useEffect(() => {
    const loadArticles = async () => {
      try {
        if (isTaskReader) {
          const pageSize = 200
          const firstPage = await getTaskList({ task_pid: productId, page: 1, perPage: pageSize })
          const pageCount = Math.ceil((firstPage.count || 0) / pageSize)
          const remainingPages = await Promise.all(
            Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
              getTaskList({ task_pid: productId, page: index + 2, perPage: pageSize }),
            ),
          )
          const rows = [firstPage, ...remainingPages].flatMap((page) => page.rows || [])
          setArticles(rows.map(mapTaskArticle))
          return
        }
        const res = await getProductArticles({
          cid: productId,
          page: 1,
          perPage: 500,
          order: 'earliest',
          sample: false,
        })
        setArticles((res.rows || []).map(mapProductArticle))
      } catch (error) {
        console.error('Failed to load course catalog', error)
      }
    }
    loadArticles()
  }, [isTaskReader, productId])

  useEffect(() => {
    const loadArticle = async () => {
      setLoading(true)
      setArticleDetail(null)
      setOutline([])
      try {
        if (isTaskReader) {
          const res = await getTaskInfo(articleId)
          const article = res.article || res.task.article || {}
          const taskSummary = res.task.subtitle === '无' ? undefined : res.task.subtitle
          setArticleDetail({
            ...article,
            title: res.task.task_name || article.title,
            summary: taskSummary || article.summary,
            content: article.content,
            cover: article.cover,
            video: article.video,
            video_preview: article.video_preview,
            audio: article.audio,
            play_url: res.play_url,
            is_video: res.task.is_video,
            redirect: res.task.redirect,
          })
        } else {
          setArticleDetail(await getArticleInfo(articleId))
        }
        window.scrollTo({ top: 0 })
      } catch (error) {
        console.error('Failed to load article detail', error)
      } finally {
        setLoading(false)
      }
    }
    loadArticle()
  }, [articleId, isTaskReader])

  useEffect(() => {
    if (!articleDetail?.content || !contentRef.current) return
    const headings = Array.from(contentRef.current.querySelectorAll('h1, h2, h3, h4'))
    setOutline(headings.map((heading, index) => {
      const id = `article-heading-${index}`
      heading.id = id
      return {
        id,
        text: heading.textContent?.trim() || `第 ${index + 1} 节`,
        level: Number(heading.tagName.slice(1)),
      }
    }))
  }, [articleDetail])

  useEffect(() => {
    const video = videoRef.current
    const videoUrl = getVideoUrl(articleDetail)
    if (!video || !videoUrl) return

    const destroyHls = () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
    destroyHls()

    if (!videoUrl.includes('.m3u8')) {
      video.src = videoUrl
      return destroyHls
    }

    const initHls = async () => {
      const Hls = (await import('hls.js')).default
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true })
        hlsRef.current = hls
        hls.loadSource(videoUrl)
        hls.attachMedia(video)
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = videoUrl
      }
    }
    initHls().catch((error) => console.error('Failed to load video', error))
    return destroyHls
  }, [articleDetail])

  const openArticle = (id: string | number) => {
    navigate(`/${isTaskReader ? 'task' : 'product'}/read/${productId}/${id}`)
    setCatalogOpen(false)
  }

  const scrollToHeading = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setOutlineOpen(false)
  }

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-gray-800">
      <header className="sticky top-0 z-30 flex h-16 items-center border-b border-gray-200 bg-white/95 px-4 backdrop-blur md:px-6">
        <button className="mr-3 rounded-lg p-2 hover:bg-gray-100 lg:hidden" onClick={() => setCatalogOpen(true)} aria-label="打开课程目录">
          <Menu size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold md:text-lg">{currentArticle?.title || '课程阅读'}</h1>
          {currentArticle?.summary && <p className="mt-0.5 hidden truncate text-sm text-gray-500 md:block">{currentArticle.summary}</p>}
        </div>
        <button className="ml-3 rounded-lg p-2 hover:bg-gray-100 xl:hidden" onClick={() => setOutlineOpen(true)} aria-label="打开文章大纲">
          <PanelRight size={20} />
        </button>
      </header>

      <div className="mx-auto grid max-w-[1680px] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_240px]">
        <aside className={`${catalogOpen ? 'fixed inset-y-0 left-0 z-50 flex w-[300px]' : 'hidden'} flex-col border-r border-gray-200 bg-white lg:sticky lg:top-16 lg:flex lg:h-[calc(100vh-4rem)]`}>
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div className="flex items-center gap-2 font-semibold"><List size={18} />课程目录</div>
            <button className="rounded p-1 hover:bg-gray-100 lg:hidden" onClick={() => setCatalogOpen(false)}><X size={18} /></button>
          </div>
          <nav className="flex-1 overflow-y-auto p-3">
            {articles.map((article, index) => (
              <button
                key={article.id}
                onClick={() => openArticle(article.id)}
                className={`mb-1 flex w-full gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors ${String(article.id) === articleId ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
              >
                <span className="w-7 flex-shrink-0 text-right text-xs leading-5 text-gray-400">{index + 1}</span>
                <span className="line-clamp-2 leading-5">{article.title}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-10 xl:px-14">
          {loading ? (
            <div className="flex min-h-[60vh] items-center justify-center"><Spinner size="lg" /></div>
          ) : articleDetail ? (
            <article className="mx-auto max-w-4xl">
              <div className="mb-8 border-b border-gray-200 pb-6">
                <h2 className="text-2xl font-bold leading-tight text-gray-900 md:text-3xl">{currentArticle?.title || articleDetail.title}</h2>
                {(currentArticle?.summary || articleDetail.summary) && <p className="mt-3 leading-7 text-gray-500">{currentArticle?.summary || articleDetail.summary}</p>}
              </div>

              {getVideoUrl(articleDetail) && (
                <div className="mb-8 overflow-hidden rounded-xl bg-black shadow-sm">
                  <video ref={videoRef} controls className="aspect-video w-full" poster={articleDetail.cover?.default}>您的浏览器不支持视频播放</video>
                </div>
              )}
              {getAudioUrl(articleDetail) && !getVideoUrl(articleDetail) && <audio controls className="mb-8 w-full" src={getAudioUrl(articleDetail)} />}

              {articleDetail.content && <div ref={contentRef} className="article-content course-reader-content" dangerouslySetInnerHTML={{ __html: articleDetail.content }} />}

              <div className="mt-10 flex items-center justify-between border-t border-gray-200 pt-6">
                <button disabled={currentIndex <= 0} onClick={() => openArticle(articles[currentIndex - 1].id)} className="flex items-center gap-1 rounded-lg border bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} />上一篇</button>
                {articleDetail.redirect && <a href={articleDetail.redirect} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700">查看源站<ExternalLink size={14} /></a>}
                <button disabled={currentIndex < 0 || currentIndex >= articles.length - 1} onClick={() => openArticle(articles[currentIndex + 1].id)} className="flex items-center gap-1 rounded-lg border bg-white px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">下一篇<ChevronRight size={16} /></button>
              </div>
            </article>
          ) : <div className="py-24 text-center text-gray-500">课程内容加载失败</div>}
        </main>

        <aside className={`${outlineOpen ? 'fixed inset-y-0 right-0 z-50 flex w-[280px]' : 'hidden'} flex-col border-l border-gray-200 bg-white xl:sticky xl:top-16 xl:flex xl:h-[calc(100vh-4rem)]`}>
          <div className="flex items-center justify-between border-b px-5 py-4">
            <span className="font-semibold">文章大纲</span>
            <button className="rounded p-1 hover:bg-gray-100 xl:hidden" onClick={() => setOutlineOpen(false)}><X size={18} /></button>
          </div>
          <nav className="overflow-y-auto p-4">
            {outline.length ? outline.map((item) => (
              <button key={item.id} onClick={() => scrollToHeading(item.id)} className="block w-full border-l-2 border-transparent py-2 pr-2 text-left text-sm leading-5 text-gray-500 hover:border-primary-400 hover:text-primary-600" style={{ paddingLeft: `${Math.max(12, (item.level - 1) * 12)}px` }}>{item.text}</button>
            )) : <p className="px-2 py-3 text-sm text-gray-400">本文暂无大纲</p>}
          </nav>
        </aside>
      </div>

      {(catalogOpen || outlineOpen) && <button className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => { setCatalogOpen(false); setOutlineOpen(false) }} aria-label="关闭侧栏" />}
    </div>
  )
}
