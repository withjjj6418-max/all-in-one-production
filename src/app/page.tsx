'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { Search, FolderKanban, BarChart3, PenLine, Music, Image, Film, Upload, Settings, ArrowRight, TrendingUp, Clock, Zap } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const workflows = [
  { step: 1, label: '리서치', desc: '레퍼런스 탐색', href: '/research', icon: Search, color: 'bg-pink-100 text-pink-500' },
  { step: 2, label: '채널/영상 분석', desc: '벤치마크 분석', href: '/analytics', icon: BarChart3, color: 'bg-orange-100 text-orange-500' },
  { step: 3, label: '대본작성', desc: 'AI 대본 생성', href: '/scripts', icon: PenLine, color: 'bg-yellow-100 text-yellow-600' },
  { step: 4, label: '사운드', desc: 'TTS + 음악', href: '/post/sound', icon: Music, color: 'bg-green-100 text-green-600' },
  { step: 5, label: '이미지/영상', desc: '스토리보드 생성', href: '/post/image', icon: Image, color: 'bg-blue-100 text-blue-500' },
  { step: 6, label: '편집', desc: '브루 연동', href: '/post/edit', icon: Film, color: 'bg-purple-100 text-purple-500' },
]

const quickLinks = [
  { label: '새 프로젝트', href: '/projects', icon: FolderKanban, color: 'bg-[#F2A8B8]' },
  { label: '채널 관리', href: '/channels', icon: Settings, color: 'bg-[#7C8C4E]' },
  { label: '리서치 시작', href: '/research', icon: Search, color: 'bg-orange-400' },
]

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

type Project = {
  id: number
  title: string
  status: string
  progress: number
  updated_at: string
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [totalProjects, setTotalProjects] = useState(0)
  const [inProgressCount, setInProgressCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const { data } = await supabase
        .from('projects')
        .select('id, title, status, progress, updated_at')
        .order('updated_at', { ascending: false })
        .limit(3)
      setProjects(data || [])

      const { count: total } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
      setTotalProjects(total || 0)

      const { count: inProgress } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .not('status', 'in', '("시작 전","업로드 완료")')
      setInProgressCount(inProgress || 0)

      setLoading(false)
    }
    fetchData()
  }, [])

  return (
    <div className="p-6 space-y-6">

      {/* 인사말 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">안녕하세요! 👋</h1>
            <p className="text-gray-500 mt-1">오늘도 좋은 콘텐츠 만들어봐요.</p>
          </div>
          <div className="flex gap-3">
            {quickLinks.map((link, i) => (
              <Link key={i} href={link.href}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium hover:opacity-90 transition ${link.color}`}>
                <link.icon size={15} />
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '진행 중인 프로젝트', value: loading ? '...' : `${inProgressCount}개`, icon: <FolderKanban size={20} />, color: 'bg-pink-100 text-pink-500' },
          { label: '전체 프로젝트', value: loading ? '...' : `${totalProjects}개`, icon: <TrendingUp size={20} />, color: 'bg-green-100 text-green-600' },
          { label: '최근 업데이트', value: loading ? '...' : (projects[0] ? timeAgo(projects[0].updated_at) : '-'), icon: <Clock size={20} />, color: 'bg-blue-100 text-blue-500' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.color}`}>
              {stat.icon}
            </div>
            <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
            <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* 워크플로우 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-5">
          <Zap size={18} className="text-[#7C8C4E]" />
          <h2 className="font-semibold text-gray-700">콘텐츠 제작 워크플로우</h2>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {workflows.map((item, i) => (
            <div key={i} className="flex items-center gap-2 flex-shrink-0">
              <Link href={item.href}
                className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-gray-50 transition group w-28">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
                  <item.icon size={18} />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold text-gray-700">{item.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
                </div>
                <span className="text-[10px] text-gray-300 group-hover:text-[#7C8C4E] transition font-medium">
                  STEP {item.step}
                </span>
              </Link>
              {i < workflows.length - 1 && (
                <ArrowRight size={16} className="text-gray-300 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 최근 프로젝트 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700">최근 프로젝트</h2>
          <Link href="/projects" className="text-xs text-[#7C8C4E] font-medium hover:underline flex items-center gap-1">
            전체 보기 <ArrowRight size={12} />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-xl animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <FolderKanban size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">아직 프로젝트가 없어요</p>
            <Link href="/projects" className="text-xs text-[#7C8C4E] font-medium mt-1 inline-block hover:underline">
              첫 프로젝트 만들기 →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <div key={project.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-50 transition">
                <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center flex-shrink-0">
                  <FolderKanban size={18} className="text-pink-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800">{project.title}</p>
                    <span className="text-xs text-gray-400">{timeAgo(project.updated_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-[#7C8C4E] h-1.5 rounded-full transition-all"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-16 text-right">{project.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}