'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, TrendingUp, BookOpen, ExternalLink, Filter, Play, FileText, Trash2, Loader2, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Research = {
    id: number
    title: string
    type: string | null
    url: string | null
    memo: string | null
    tags: string[] | null
    created_at: string
}

export default function ResearchPage() {
    const [activeTab, setActiveTab] = useState('youtube')
    const [subscribers, setSubscribers] = useState('10000')
    const [views, setViews] = useState('1000000')
    const [period, setPeriod] = useState('90')
    const [keyword, setKeyword] = useState('')

    /* DB 데이터 */
    const [items, setItems] = useState<Research[]>([])
    const [loading, setLoading] = useState(true)

    const fetchItems = useCallback(async () => {
        setLoading(true)
        const { data } = await supabase.from('research').select('*').order('created_at', { ascending: false })
        setItems(data ?? [])
        setLoading(false)
    }, [])

    useEffect(() => { fetchItems() }, [fetchItems])

    /* 저장 (유튜브 리서치 → 저장 버튼, NotebookLM → 저장 버튼) */
    const handleSave = async (title: string, type: string, opts?: { url?: string; memo?: string; tags?: string[] }) => {
        const { error } = await supabase.from('research').insert({
            title,
            type,
            url: opts?.url ?? null,
            memo: opts?.memo ?? null,
            tags: opts?.tags ?? null,
        })
        if (!error) fetchItems()
    }

    const handleDelete = async (id: number) => {
        const { error } = await supabase.from('research').delete().eq('id', id)
        if (!error) fetchItems()
    }

    /* NotebookLM 상태 */
    const [noteMemo, setNoteMemo] = useState('')
    const [noteTitle, setNoteTitle] = useState('')
    const [noteTags, setNoteTags] = useState('')

    const handleSaveNote = async () => {
        if (!noteTitle) return
        await handleSave(noteTitle, 'NotebookLM', {
            memo: noteMemo,
            tags: noteTags.split(',').map(t => t.trim()).filter(Boolean),
        })
        setNoteTitle('')
        setNoteMemo('')
        setNoteTags('')
    }

    const formatDate = (d: string) => new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '.').replace('.', '')

    /* 필터 */
    const savedItems = items
    const notebookItems = items.filter(i => i.type === 'NotebookLM')
    const youtubeItems = items.filter(i => i.type === '유튜브')

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center gap-3">
                <span className="text-2xl">🔍</span>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">리서치</h1>
                    <p className="text-sm text-gray-500">레퍼런스 영상 탐색 및 자료 수집</p>
                </div>
            </div>

            {/* 탭 */}
            <div className="flex gap-2 bg-white rounded-2xl p-2 shadow-sm border border-gray-100">
                {[
                    { id: 'youtube', label: '🎬 유튜브 리서치' },
                    { id: 'notebook', label: '📓 NotebookLM' },
                    { id: 'saved', label: '📌 저장된 자료' },
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-2 px-4 rounded-xl text-sm font-medium transition ${activeTab === tab.id
                            ? 'bg-[#7C8C4E] text-white'
                            : 'text-gray-500 hover:bg-gray-50'
                            }`}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 유튜브 리서치 탭 */}
            {activeTab === 'youtube' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                            <Filter size={16} />
                            검색 필터
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600 mb-2 block">키워드</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={keyword}
                                        onChange={e => setKeyword(e.target.value)}
                                        placeholder="검색할 키워드 입력..."
                                        className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                                    />
                                    <button className="px-4 py-2 bg-[#F2A8B8] text-white rounded-xl text-sm font-medium hover:opacity-90 transition">
                                        검색
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="text-sm font-medium text-gray-600 mb-2 block">
                                        최대 구독자 수
                                    </label>
                                    <select
                                        value={subscribers}
                                        onChange={e => setSubscribers(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200">
                                        <option value="1000">1천 이하</option>
                                        <option value="10000">1만 이하</option>
                                        <option value="50000">5만 이하</option>
                                        <option value="100000">10만 이하</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-600 mb-2 block">
                                        최소 조회수
                                    </label>
                                    <select
                                        value={views}
                                        onChange={e => setViews(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200">
                                        <option value="100000">10만 이상</option>
                                        <option value="500000">50만 이상</option>
                                        <option value="1000000">100만 이상</option>
                                        <option value="5000000">500만 이상</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium text-gray-600 mb-2 block">
                                        업로드 기간
                                    </label>
                                    <select
                                        value={period}
                                        onChange={e => setPeriod(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200">
                                        <option value="30">1개월 이내</option>
                                        <option value="90">3개월 이내</option>
                                        <option value="180">6개월 이내</option>
                                        <option value="365">1년 이내</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 저장된 유튜브 자료 */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                                <TrendingUp size={16} />
                                저장된 유튜브 리서치
                            </h2>
                            <button
                                onClick={() => handleSave(keyword || '새 리서치', '유튜브')}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[#7C8C4E] text-white rounded-lg hover:opacity-90 transition"
                            >
                                <Plus size={12} /> 직접 추가
                            </button>
                        </div>
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 size={20} className="animate-spin text-pink-400" />
                            </div>
                        ) : youtubeItems.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-8">저장된 유튜브 리서치가 없습니다.</p>
                        ) : (
                            <div className="space-y-3">
                                {youtubeItems.map(item => (
                                    <div key={item.id} className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
                                        <div className="w-24 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <Play size={20} className="text-gray-400" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-gray-800">{item.title}</p>
                                            {item.url && <p className="text-xs text-blue-500 mt-0.5 truncate">{item.url}</p>}
                                            {item.tags && item.tags.length > 0 && (
                                                <div className="flex gap-1 mt-1">
                                                    {item.tags.map(tag => (
                                                        <span key={tag} className="text-xs bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full">{tag}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={() => handleDelete(item.id)}
                                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* NotebookLM 탭 */}
            {activeTab === 'notebook' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                                <BookOpen size={16} />
                                NotebookLM 연동
                            </h2>
                            <a href="https://notebooklm.google.com" target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-[#7C8C4E] font-medium hover:underline">
                                <ExternalLink size={12} />
                                NotebookLM 열기
                            </a>
                        </div>
                        <div className="space-y-3">
                            <input
                                type="text"
                                value={noteTitle}
                                onChange={e => setNoteTitle(e.target.value)}
                                placeholder="제목"
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                            />
                            <textarea
                                value={noteMemo}
                                onChange={e => setNoteMemo(e.target.value)}
                                className="w-full h-40 p-4 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-200"
                                placeholder="NotebookLM에서 정리한 내용을 붙여넣으세요..."
                            />
                            <input
                                type="text"
                                value={noteTags}
                                onChange={e => setNoteTags(e.target.value)}
                                placeholder="태그 (쉼표 구분, 예: 지정학, 석유, 경제)"
                                className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                            />
                        </div>
                        <div className="flex gap-2 mt-3">
                            <button onClick={handleSaveNote}
                                className="px-4 py-2 bg-[#F2A8B8] text-white rounded-xl text-sm font-medium hover:opacity-90 transition">
                                저장
                            </button>
                            <button onClick={() => { setNoteTitle(''); setNoteMemo(''); setNoteTags('') }}
                                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
                                초기화
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h2 className="font-semibold text-gray-700 mb-4">📋 저장된 노트</h2>
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 size={20} className="animate-spin text-pink-400" />
                            </div>
                        ) : notebookItems.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-8">저장된 노트가 없습니다.</p>
                        ) : (
                            notebookItems.map(note => (
                                <div key={note.id} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 mb-2">
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">{note.title}</p>
                                        {note.tags && note.tags.length > 0 && (
                                            <div className="flex gap-1 mt-1">
                                                {note.tags.map(tag => (
                                                    <span key={tag} className="text-xs bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">{formatDate(note.created_at)}</span>
                                        <button onClick={() => handleDelete(note.id)}
                                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition">
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* 저장된 자료 탭 */}
            {activeTab === 'saved' && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                    <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                        <FileText size={16} />
                        저장된 레퍼런스
                    </h2>
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 size={20} className="animate-spin text-pink-400" />
                        </div>
                    ) : savedItems.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">저장된 자료가 없습니다.</p>
                    ) : (
                        <div className="space-y-2">
                            {savedItems.map(item => (
                                <div key={item.id} className="flex items-center justify-between p-4 rounded-xl bg-gray-50">
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${item.type === '유튜브' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                                            }`}>
                                            {item.type}
                                        </span>
                                        <p className="text-sm text-gray-700">{item.title}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">{formatDate(item.created_at)}</span>
                                        <button onClick={() => handleDelete(item.id)}
                                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition">
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}