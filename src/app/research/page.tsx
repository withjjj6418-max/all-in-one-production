'use client'

import { useState } from 'react'
import { Search, TrendingUp, BookOpen, ExternalLink, Filter, Play, FileText } from 'lucide-react'

export default function ResearchPage() {
    const [activeTab, setActiveTab] = useState('youtube')
    const [subscribers, setSubscribers] = useState('10000')
    const [views, setViews] = useState('1000000')
    const [period, setPeriod] = useState('90')
    const [keyword, setKeyword] = useState('')

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

                    {/* 검색 결과 */}
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
                            <TrendingUp size={16} />
                            검색 결과
                        </h2>
                        <div className="space-y-3">
                            {[
                                { title: '구독자 8천명인데 조회수 230만 터진 영상', channel: '작은채널A', views: '230만', subs: '8,200', days: '45일 전' },
                                { title: '팔로워 5천인데 150만뷰 나온 이유', channel: '소규모크리에이터', views: '152만', subs: '5,100', days: '62일 전' },
                                { title: '구독자 1만도 안됐는데 바이럴 터진 썰', channel: '신생채널B', views: '98만', subs: '9,800', days: '28일 전' },
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
                                    <div className="w-24 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <Play size={20} className="text-gray-400" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-800">{item.title}</p>
                                        <p className="text-xs text-gray-500 mt-1">{item.channel} · 구독자 {item.subs}</p>
                                        <div className="flex gap-3 mt-1">
                                            <span className="text-xs text-pink-600 font-medium">조회수 {item.views}</span>
                                            <span className="text-xs text-gray-400">{item.days}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button className="px-3 py-1.5 text-xs bg-[#7C8C4E] text-white rounded-lg hover:opacity-90 transition">
                                            저장
                                        </button>
                                        <button className="px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 transition">
                                            분석
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
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
                        <p className="text-sm text-gray-500 mb-4">
                            NotebookLM에서 수집한 자료를 여기에 붙여넣어 관리하세요.
                        </p>
                        <textarea
                            className="w-full h-40 p-4 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-200"
                            placeholder="NotebookLM에서 정리한 내용을 붙여넣으세요..."
                        />
                        <div className="flex gap-2 mt-3">
                            <button className="px-4 py-2 bg-[#F2A8B8] text-white rounded-xl text-sm font-medium hover:opacity-90 transition">
                                저장
                            </button>
                            <button className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
                                초기화
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h2 className="font-semibold text-gray-700 mb-4">📋 저장된 노트</h2>
                        {[
                            { title: '호르무즈 해협 관련 자료', date: '2026.05.09', tags: ['지정학', '석유', '경제'] },
                            { title: 'AI 영상 편집 트렌드', date: '2026.05.07', tags: ['AI', '유튜브', '편집'] },
                        ].map((note, i) => (
                            <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 mb-2">
                                <div>
                                    <p className="text-sm font-medium text-gray-800">{note.title}</p>
                                    <div className="flex gap-1 mt-1">
                                        {note.tags.map(tag => (
                                            <span key={tag} className="text-xs bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <span className="text-xs text-gray-400">{note.date}</span>
                            </div>
                        ))}
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
                    <div className="space-y-2">
                        {[
                            { title: '구독자 8천명인데 조회수 230만 터진 영상', type: '유튜브', date: '2026.05.09' },
                            { title: '호르무즈 해협 관련 자료', type: 'NotebookLM', date: '2026.05.09' },
                            { title: 'AI 영상 편집 트렌드', type: 'NotebookLM', date: '2026.05.07' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-gray-50">
                                <div className="flex items-center gap-3">
                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${item.type === '유튜브' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                                        }`}>
                                        {item.type}
                                    </span>
                                    <p className="text-sm text-gray-700">{item.title}</p>
                                </div>
                                <span className="text-xs text-gray-400">{item.date}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}