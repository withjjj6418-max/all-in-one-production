'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, ExternalLink, Trash2, Folder, AlertCircle, Check, X, Loader2, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Source {
  id: number
  user_id: string
  category: string
  title: string | null
  url: string
  memo: string | null
  nickname: string | null
  created_at: string
}

export default function ResearchPage() {
  const supabase = createClient()
  
  // 상태 관리
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('전체')
  
  // 모달 상태 (추가 및 수정 모드 겸용)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null)
  const [formCategory, setFormCategory] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formMemo, setFormMemo] = useState('')
  
  // 유저 정보 및 토스트
  const [userId, setUserId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // 카테고리별 페이지 상태
  const [categoryPages, setCategoryPages] = useState<Record<string, number>>({})

  // 카테고리 접힘 상태
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})

  // 카테고리 접기/펼치기 토글 핸들러
  const toggleCategoryCollapse = (category: string) => {
    setCollapsedCategories((prev) => {
      const currentVal = prev[category] ?? true
      return {
        ...prev,
        [category]: !currentVal,
      }
    })
  }

  // 페이지 전환 핸들러
  const handlePageChange = (category: string, page: number) => {
    setCategoryPages((prev) => ({
      ...prev,
      [category]: page,
    }))
  }

  // 페이지 번호 생성 헬퍼 함수
  const getPageNumbers = (current: number, total: number) => {
    const pages: (number | string)[] = []
    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i)
    } else {
      pages.push(1)
      if (current > 3) {
        pages.push('...')
      }
      const start = Math.max(2, current - 1)
      const end = Math.min(total - 1, current + 1)
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }
      if (current < total - 2) {
        pages.push('...')
      }
      pages.push(total)
    }
    return pages
  }

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // 데이터 조회 (RPC 함수 호출로 변경)
  const fetchSources = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setSources([])
        setLoading(false)
        return
      }
      setUserId(user.id)
      
      // get_sources_with_nickname RPC 호출 (정렬 및 RLS 필터가 DB 내부에서 자동 수행됨)
      const { data, error } = await supabase.rpc('get_sources_with_nickname')

      if (error) {
        console.error('소스 조회 중 오류 발생:', error.message)
      } else {
        setSources(data || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchSources()
  }, [fetchSources])

  // 추가 모드 모달 열기
  const openAddModal = () => {
    setEditingSourceId(null)
    setFormCategory('')
    setFormTitle('')
    setFormUrl('')
    setFormMemo('')
    setIsModalOpen(true)
  }

  // 특정 카테고리를 지정하여 추가 모드 모달 열기
  const openAddModalWithCategory = (categoryName: string) => {
    setEditingSourceId(null)
    setFormCategory(categoryName)
    setFormTitle('')
    setFormUrl('')
    setFormMemo('')
    setIsModalOpen(true)
  }

  // 수정 모드 모달 열기
  const openEditModal = (source: Source) => {
    setEditingSourceId(source.id)
    setFormCategory(source.category || '')
    setFormTitle(source.title || '')
    setFormUrl(source.url || '')
    setFormMemo(source.memo || '')
    setIsModalOpen(true)
  }

  // 폼 제출 (추가 또는 수정 처리 - 테이블 insert/update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formUrl.trim()) {
      alert('링크 URL은 필수 입력 항목입니다.')
      return
    }

    const finalCategory = formCategory.trim() || '미분류'
    const finalTitle = formTitle.trim() || null
    const finalMemo = formMemo.trim() || null

    try {
      if (editingSourceId) {
        // 수정 모드
        const { error } = await supabase
          .from('research_sources')
          .update({
            category: finalCategory,
            title: finalTitle,
            url: formUrl.trim(),
            memo: finalMemo
          })
          .eq('id', editingSourceId)

        if (error) {
          alert(`소스 수정 실패: ${error.message}`)
        } else {
          showToast('✏️ 소스가 정상적으로 수정되었습니다!')
          setIsModalOpen(false)
          fetchSources()
        }
      } else {
        // 추가 모드
        const { error } = await supabase.from('research_sources').insert({
          user_id: userId,
          category: finalCategory,
          title: finalTitle,
          url: formUrl.trim(),
          memo: finalMemo
        })

        if (error) {
          alert(`소스 추가 실패: ${error.message}`)
        } else {
          showToast('🎉 새로운 소스가 안전하게 저장되었습니다!')
          setIsModalOpen(false)
          fetchSources()
        }
      }
    } catch (err) {
      console.error(err)
      alert('처리 중 예측하지 못한 오류가 발생했습니다.')
    }
  }

  // 소스 삭제 - 테이블 delete
  const handleDeleteSource = async (id: number) => {
    if (!window.confirm('정말로 이 소스를 삭제하시겠습니까?')) return

    try {
      const { error } = await supabase
        .from('research_sources')
        .delete()
        .eq('id', id)

      if (error) {
        alert(`삭제 실패: ${error.message}`)
      } else {
        showToast('🗑️ 소스가 삭제되었습니다.')
        fetchSources()
      }
    } catch (err) {
      console.error(err)
    }
  }

  // 중복 없는 카테고리 목록 추출
  const uniqueCategories = Array.from(
    new Set(sources.map((s) => s.category || '미분류'))
  ).sort((a, b) => a.localeCompare(b, 'ko'))

  // 클라이언트 측 검색 및 카테고리 필터링
  const filteredSources = sources.filter((source) => {
    const titleMatch = source.title?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false
    const urlMatch = source.url.toLowerCase().includes(searchQuery.toLowerCase())
    const memoMatch = source.memo?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false
    const nicknameMatch = source.nickname?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false
    const keywordMatch = searchQuery === '' || titleMatch || urlMatch || memoMatch || nicknameMatch

    const categoryMatch = selectedCategory === '전체' || (source.category || '미분류') === selectedCategory

    return keywordMatch && categoryMatch
  })

  // 필터링된 결과를 카테고리별로 그룹화
  const groupedSources: { [key: string]: Source[] } = {}
  filteredSources.forEach((source) => {
    const cat = source.category || '미분류'
    if (!groupedSources[cat]) {
      groupedSources[cat] = []
    }
    groupedSources[cat].push(source)
  })

  // 가나다 순으로 카테고리 정렬
  const sortedCategoryKeys = Object.keys(groupedSources).sort((a, b) =>
    a.localeCompare(b, 'ko')
  )

  return (
    <div className="px-3 py-3 sm:p-5 space-y-4 max-w-7xl mx-auto min-w-0">
      
      {/* ─── 1. 페이지 상단 헤더 영역 ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-brand-olive/10 text-brand-olive rounded-xl shadow-inner">
            <span className="text-2xl leading-none">🔖</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">소스 게시판</h1>
            <p className="text-[11px] text-gray-400 font-medium mt-0.5">영상 기획에 필요한 레퍼런스 소스 모음 및 관리</p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#7C8C4E] hover:bg-[#6c7b44] text-white rounded-xl text-xs font-semibold shadow-sm hover:shadow transition-all transform hover:-translate-y-0.5 active:translate-y-0 shrink-0"
        >
          <Plus size={14} className="stroke-[2.5]" />
          <span>소스 추가</span>
        </button>
      </div>

      {/* ─── 2. 검색 및 카테고리 필터 영역 (미니멀 + 상단 배치) ─── */}
      <div className="flex flex-col sm:flex-row gap-2 max-w-2xl">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="검색..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#7C8C4E]/30 focus:border-[#7C8C4E] transition-all bg-gray-50/50 text-gray-700 font-medium"
          />
        </div>
        <div className="w-full sm:w-44 shrink-0">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#7C8C4E]/30 focus:border-[#7C8C4E] transition-all bg-white font-semibold text-gray-600 cursor-pointer"
          >
            <option value="전체">📂 전체 카테고리</option>
            {uniqueCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── 3. 메인 게시판 리스트 영역 ─── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <Loader2 size={24} className="animate-spin text-[#7C8C4E]" />
          <p className="text-xs font-semibold text-gray-400">데이터를 불러오는 중입니다...</p>
        </div>
      ) : sources.length === 0 ? (
        /* 등록된 소스가 아예 없는 완전 초기 상태 */
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm space-y-3">
          <div className="p-3 bg-gray-50 rounded-full text-gray-400">
            <Folder size={32} className="stroke-[1.5]" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-gray-700">아직 등록된 소스가 없어요</h3>
            <p className="text-xs text-gray-400 max-w-sm">영상 제작에 참고할 유튜브 영상, 뉴스레터, 블로그 포스트 등 모든 소스 링크를 한 곳에 모아보세요.</p>
          </div>
          <button
            onClick={openAddModal}
            className="px-4 py-2 bg-[#7C8C4E] hover:bg-[#6c7b44] text-white text-xs font-semibold rounded-xl transition shadow-sm"
          >
            첫 소스 추가하기
          </button>
        </div>
      ) : sortedCategoryKeys.length === 0 ? (
        /* 검색/필터 결과가 없는 상태 */
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-2xl border border-gray-100 shadow-sm space-y-1.5">
          <AlertCircle size={28} className="text-gray-400" />
          <p className="text-xs font-bold text-gray-600">일치하는 소스를 찾지 못했습니다.</p>
          <p className="text-[11px] text-gray-400">검색어나 카테고리 필터를 다시 확인해 보세요.</p>
        </div>
      ) : (
        /* 그룹핑된 리스트형 게시판 */
        <div className="space-y-3">
          {sortedCategoryKeys.map((categoryName) => {
            const list = groupedSources[categoryName]
            
            // 페이지네이션 관련 연산
            const itemsPerPage = 10
            const totalItems = list.length
            const totalPages = Math.ceil(totalItems / itemsPerPage)
            
            // 검색 필터 등으로 아이템 개수 급감 시 현재 페이지 보정
            const currentPage = categoryPages[categoryName] || 1
            const activePage = Math.min(currentPage, Math.max(1, totalPages))
            
            // 10개씩 페이징 처리된 리스트 슬라이싱
            const paginatedList = list.slice((activePage - 1) * itemsPerPage, activePage * itemsPerPage)

            // 접힘 여부 상태 (기본값 true로 설정하여 모두 접힘으로 시작)
            const isSearching = searchQuery.trim() !== ''
            const isFiltering = selectedCategory !== '전체'
            const isSearchingOrFiltering = isSearching || isFiltering
            
            const isCollapsed = collapsedCategories[categoryName] ?? true
            const activeCollapsed = isSearchingOrFiltering ? false : isCollapsed

            return (
              <div
                key={categoryName}
                className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden transition-all hover:shadow-md"
              >
                {/* 카테고리 타이틀 바 */}
                <div className="flex items-center justify-between px-4 py-1.5 bg-gray-50/50 border-b border-gray-100 gap-2 min-w-0">
                  {/* 왼쪽 영역: 아이콘, 카테고리명, 개수 뱃지 */}
                  <div className="flex items-center gap-1.5 min-w-0 max-w-[40%] sm:max-w-[50%]">
                    <Folder size={14} className="text-[#7C8C4E] shrink-0" />
                    <h2 className="text-xs font-bold text-gray-800 tracking-tight truncate flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{categoryName}</span>
                      <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-semibold text-gray-400 bg-gray-200/50 rounded-full">
                        {list.length}
                      </span>
                    </h2>
                  </div>

                  {/* 오른쪽 영역: 페이지네이션 UI 및 +버튼, V버튼 */}
                  <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                    {/* 페이지네이션 UI (10개 초과 시 및 펼쳐진 상태일 때만 노출) */}
                    {totalPages > 1 && !activeCollapsed && (
                      <div className="flex items-center gap-0.5 flex-wrap shrink-0">
                        <button
                          onClick={() => handlePageChange(categoryName, Math.max(1, activePage - 1))}
                          disabled={activePage === 1}
                          className="p-0.5 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                          title="이전 페이지"
                        >
                          <ChevronLeft size={12} />
                        </button>
                        
                        {getPageNumbers(activePage, totalPages).map((p, idx) => {
                          if (p === '...') {
                            return (
                              <span key={`ellipsis-${idx}`} className="px-0.5 text-[9px] sm:text-[10px] text-gray-400">
                                ...
                              </span>
                            )
                          }
                          return (
                            <button
                              key={`page-${p}`}
                              onClick={() => handlePageChange(categoryName, p as number)}
                              className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold transition cursor-pointer ${
                                activePage === p
                                  ? 'bg-[#7C8C4E]/90 text-white shadow-sm'
                                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                              }`}
                            >
                              {p}
                            </button>
                          )
                        })}

                        <button
                          onClick={() => handlePageChange(categoryName, Math.min(totalPages, activePage + 1))}
                          disabled={activePage === totalPages}
                          className="p-0.5 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
                          title="다음 페이지"
                        >
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    )}

                    {/* "+" 추가 버튼 */}
                    <button
                      onClick={() => openAddModalWithCategory(categoryName)}
                      className="p-1 rounded text-gray-400 hover:text-[#7C8C4E] hover:bg-gray-200/40 transition shrink-0 ml-1"
                      title={`${categoryName} 카테고리에 소스 추가`}
                    >
                      <Plus size={13} className="stroke-[2.5]" />
                    </button>

                    {/* "V" 토글 버튼 (ChevronDown) */}
                    <button
                      onClick={() => toggleCategoryCollapse(categoryName)}
                      className="p-1 rounded text-gray-400 hover:text-[#7C8C4E] hover:bg-gray-200/40 transition shrink-0"
                      title={activeCollapsed ? `${categoryName} 카테고리 펼치기` : `${categoryName} 카테고리 접기`}
                    >
                      <ChevronDown
                        size={13}
                        className={`transition-transform duration-200 ${activeCollapsed ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                </div>

                {/* 소스 리스트 나열 (펼쳐진 상태에서만 노출) */}
                {!activeCollapsed && (
                  <div className="divide-y divide-gray-50 animate-in fade-in slide-in-from-top-1 duration-150">
                    {paginatedList.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-center justify-between px-4 py-1.5 hover:bg-gray-50/40 transition-colors group gap-3 min-w-0"
                      >
                        {/* 제목, 작성자 닉네임 및 메모 정보 영역 (가로 병렬 정렬 구조) */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {/* 닉네임 뱃지 */}
                            {source.nickname && (
                              <span 
                                className="shrink-0 px-1.5 py-0.2 text-[9px] font-bold text-[#7C8C4E] bg-[#7C8C4E]/10 rounded border border-[#7C8C4E]/10 truncate max-w-[70px] sm:max-w-[100px]" 
                                title={`작성자: ${source.nickname}`}
                              >
                                {source.nickname}
                              </span>
                            )}

                            {/* 제목 */}
                            <h3
                              onClick={() => openEditModal(source)}
                              className="text-xs sm:text-sm font-semibold text-gray-700 hover:text-[#7C8C4E] hover:underline cursor-pointer truncate shrink-0 max-w-[45%] transition-colors"
                              title="클릭하여 소스 수정하기"
                            >
                              {source.title || source.url}
                            </h3>

                            {/* 메모 */}
                            {source.memo && (
                              <span 
                                className="text-[10px] sm:text-[11px] text-gray-400 truncate font-medium flex-1 min-w-0" 
                                title={source.memo}
                              >
                                {source.memo}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 액션 버튼 영역 */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => window.open(source.url, '_blank')}
                            className="flex items-center gap-0.5 px-2 py-0.5 sm:py-1 rounded-lg border border-gray-200 text-[10px] sm:text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition font-semibold"
                            title="새 창에서 링크 열기"
                          >
                            <ExternalLink size={10} />
                            <span className="hidden sm:inline">열기</span>
                          </button>
                          <button
                            onClick={() => handleDeleteSource(source.id)}
                            className="p-1 rounded-lg border border-transparent text-gray-300 hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-all md:opacity-0 md:group-hover:opacity-100"
                            title="소스 삭제"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── 소스 추가/수정 팝업 모달 ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-gray-100 overflow-hidden transform transition-all animate-in zoom-in-95 duration-200">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <span className="text-xl">🔖</span>
                <span>{editingSourceId ? '소스 레퍼런스 수정' : '새 소스 레퍼런스 추가'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* 모달 폼 */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* 카테고리 입력 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  카테고리
                </label>
                <input
                  type="text"
                  list="modal-categories"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="예: 요리, 경제, 테크 (비워두면 '미분류')"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-olive/20 focus:border-[#7C8C4E] transition-all bg-gray-50/30"
                  maxLength={30}
                />
                <datalist id="modal-categories">
                  {uniqueCategories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              {/* 제목 입력 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  제목 (선택)
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="나중에 알아보기 쉽게 제목을 적어주세요"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-olive/20 focus:border-[#7C8C4E] transition-all bg-gray-50/30"
                  maxLength={100}
                />
              </div>

              {/* URL 입력 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  링크 URL (필수)
                </label>
                <input
                  type="url"
                  required
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-olive/20 focus:border-[#7C8C4E] transition-all bg-gray-50/30 font-medium"
                />
              </div>

              {/* 메모 입력 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  메모 (선택)
                </label>
                <textarea
                  value={formMemo}
                  onChange={(e) => setFormMemo(e.target.value)}
                  placeholder="참고할 점 / 선정 이유"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-olive/20 focus:border-[#7C8C4E] transition-all bg-gray-50/30 h-24 resize-none"
                  maxLength={500}
                />
              </div>

              {/* 푸터 버튼 */}
              <div className="flex gap-2.5 pt-4 border-t border-gray-100 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-semibold transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#7C8C4E] hover:bg-[#6c7b44] text-white rounded-xl text-sm font-semibold transition shadow-md hover:shadow-lg"
                >
                  {editingSourceId ? '수정하기' : '추가하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 토스트 메시지 UI ─── */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in">
          <div className="bg-gray-800/95 backdrop-blur text-white px-6 py-3 rounded-2xl shadow-xl font-medium text-xs sm:text-sm flex items-center gap-2 border border-gray-700">
            <Check size={16} className="text-green-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

    </div>
  )
}