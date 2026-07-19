import React, { useEffect, useState, useRef } from 'react'
import { getProductArticles, getArticleInfo, ArticleItem } from '@/api/product'
import { Button, Spinner } from '@/components/ui'
import { ExternalLink, PlayCircle } from 'lucide-react'

interface ArticleListProps {
  productId: string
}

export const ArticleList: React.FC<ArticleListProps> = ({ productId }) => {
  const [loading, setLoading] = useState(false)
  const [articles, setArticles] = useState<ArticleItem[]>([])
  const [showArticleDetail, setShowArticleDetail] = useState(false)
  const [selectedArticle, setSelectedArticle] = useState<ArticleItem | null>(null)
  const [articleDetail, setArticleDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  
  // 使用 useRef 来跟踪是否已经加载过数据
  const prevProductIdRef = useRef<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<any>(null)

  useEffect(() => {
    // 只有当 productId 真正发生变化时才重新加载数据
    if (prevProductIdRef.current === productId) {
      return
    }
    
    prevProductIdRef.current = productId
    loadArticles()
  }, [productId])

  const loadArticles = async () => {
    setLoading(true)
    try {
      const res = await getProductArticles({
        cid: productId,
        page: 1,
        perPage: 500,
        order: 'earliest',
        sample: false,
      })
      setArticles(res.rows || [])
    } catch (error) {
      console.error('Failed to load articles', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewArticleDetail = async (article: ArticleItem) => {
    setSelectedArticle(article)
    setShowArticleDetail(true)
    setDetailLoading(true)
    try {
      const res = await getArticleInfo(article.id)
      setArticleDetail(res)
    } catch (error) {
      console.error('Failed to load article detail', error)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleOpenReader = (event: React.MouseEvent, article: ArticleItem) => {
    event.stopPropagation()
    window.open(`/product/read/${productId}/${article.id}`, '_blank', 'noopener,noreferrer')
  }

  // 初始化 HLS 播放器
  useEffect(() => {
    const video = videoRef.current
    if (!video || !showArticleDetail) return

    const destroyHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }

    destroyHls()

    const initHls = async () => {
      // 获取视频源
      let videoSrc = ''
      if (articleDetail?.video?.hls_medias?.length) {
        videoSrc = articleDetail.video.hls_medias[articleDetail.video.hls_medias.length - 1].url
      } else if (articleDetail?.video_preview?.medias?.length) {
        videoSrc = articleDetail.video_preview.medias[articleDetail.video_preview.medias.length - 1].url
      }

      if (!videoSrc || !videoSrc.includes('.m3u8')) {
        if (videoSrc) {
          video.src = videoSrc
        }
        return
      }

      try {
        const HlsModule = await import('hls.js')
        const Hls = HlsModule.default

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            debug: false
          })
          hlsRef.current = hls

          hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
            console.error('ArticleList HLS error:', data.type, data.details, data)
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  hls.startLoad()
                  break
                case Hls.ErrorTypes.MEDIA_ERROR:
                  hls.recoverMediaError()
                  break
                default:
                  destroyHls()
                  break
              }
            }
          })

          hls.loadSource(videoSrc)
          hls.attachMedia(video)
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoSrc
        }
      } catch (err) {
        console.error('Failed to load hls.js in ArticleList:', err)
        if (videoSrc && video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoSrc
        }
      }
    }

    initHls()

    return destroyHls
  }, [showArticleDetail, articleDetail])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        暂无课程章节
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-700 mb-3">课程章节 ({articles.length} 讲)</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
          {articles.map((article) => (
            <div
              key={article.id}
              className="border rounded-lg p-3 hover:border-primary-300 hover:bg-primary-50 transition-all cursor-pointer"
              onClick={() => handleViewArticleDetail(article)}
            >
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded bg-primary-100 flex items-center justify-center text-primary-600 text-xs font-bold flex-shrink-0">
                  {article.article_title.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <h5 className="flex-1 text-sm font-medium text-gray-800 truncate">
                      {article.article_title}
                    </h5>
                    <button
                      type="button"
                      onClick={(event) => handleOpenReader(event, article)}
                      className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:bg-white hover:text-primary-600"
                      title="在新页面阅读"
                      aria-label={`在新页面阅读 ${article.article_title}`}
                    >
                      <ExternalLink size={15} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                    {article.article_summary}
                  </p>
                  {(article.video_size || article.audio_size) && (
                    <div className="flex gap-2 mt-2 text-xs text-gray-400">
                      {article.video_size && (
                        <span>视频: {(article.video_size / 1048576).toFixed(2)} M</span>
                      )}
                      {article.audio_size && (
                        <span>音频: {(article.audio_size / 1048576).toFixed(2)} M</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Article Detail Modal */}
      {showArticleDetail && selectedArticle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">{selectedArticle.article_title}</h3>
              <button
                onClick={() => {
                  setShowArticleDetail(false)
                  setSelectedArticle(null)
                  setArticleDetail(null)
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              {detailLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : articleDetail ? (
                <>
                  {/* Video/Audio Player */}
                  {(articleDetail.video?.hls_medias || articleDetail.video_preview?.medias) && (
                    <div className="mb-4">
                      <video
                        ref={videoRef}
                        controls
                        className="w-full rounded-lg"
                        poster={articleDetail.cover?.default}
                      >
                        您的浏览器不支持视频播放
                      </video>
                    </div>
                  )}

                  {articleDetail.audio?.url && !articleDetail.video?.hls_medias && !articleDetail.video_preview?.medias && (
                    <div className="mb-4">
                      <audio
                        controls
                        className="w-full"
                        src={articleDetail.audio.url}
                      >
                        您的浏览器不支持音频播放
                      </audio>
                    </div>
                  )}

                  {/* Article Content */}
                  {articleDetail.content && (
                    <div className="text-sm text-gray-700 leading-relaxed space-y-3">
                      <div dangerouslySetInnerHTML={{ __html: articleDetail.content }} />
                    </div>
                  )}

                  {/* Redirect Link */}
                  {articleDetail.redirect && (
                    <div className="pt-4 border-t">
                      <Button
                        variant="secondary"
                        onClick={() => window.open(articleDetail.redirect, '_blank')}
                      >
                        <PlayCircle size={16} className="mr-2" />
                        查看源站
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  加载失败
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
