'use client'

import { useState } from 'react'
import { Plus, Edit2, Trash2, ExternalLink, PlayCircle, Users, TrendingUp } from 'lucide-react'

type Channel = {
    id: number
    name: string
    handle: string
    subscribers: string
    url: string
    category: string
    memo: string
}

const dummyChannels: Channel[] = [
    { id: 1, name: '여행 브이로그', handle: '@travel_vlog', subscribers: '8,200', url: 'https://youtube.com/@travel_vlog', category: '여행', memo: '주 2회 업로드' },
    { id: 2, name: 'AI 정보채널', handle: '@ai_info', subscribers: '3,100', url: 'https://youtube.com/@ai_info', category: 'IT/기술', memo: '쇼츠 위주' },
]

export default function ChannelsPage() {
    const [channels, setChannels] = useState<Channel[]>(dummyChannels)
    const [showForm, setShowForm] = useState(false)
    const [editId, setEditId] = useState<number | null>(null)
    const [form, setForm] = useState({ name: '', handle: '', subscribers: '', url: '', category: '', memo: '' })

    const handleSubmit = () => {
        if (!form.name) return
        if (editId !== null) {
            setChannels(channels.map(c => c.id === editId ? { ...form, id: editId } : c))
            setEditId(null)
        } else {
            setChannels([...channels, { ...form, id: Date.now() }])
        }
        setForm({ name: '', handle: '', subscribers: '', url: '', category: '', memo: '' })
        setShowForm(false)
    }

    const handleEdit = (channel: Channel) => {
        setForm({ name: channel.name, handle: channel.handle, subscribers: channel.subscribers, url: channel.url, category: channel.category, memo: channel.memo })
        setEditId(channel.id)
        setShowForm(true)
    }

    const handleDelete = (id: number) => {
        setChannels(channels.filter(c => c.id !== id))
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">⚙️</span>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">채널 관리</h1>
                        <p className="text-sm text-gray-500">운영 중인 유튜브 채널을 관리합니다</p>
                    </div>
                </div>
                <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name: '', handle: '', subscribers: '', url: '', category: '', memo: '' }) }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#F2A8B8] text-white rounded-xl text-sm font-medium hover:opacity-90 transition">
                    <Plus size={16} />
                    채널 추가
                </button>
            </div>

            {/* 통계 요약 */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: '총 채널 수', value: `${channels.length}개`, icon: <PlayCircle size={20} />, color: 'pink' },
                    { label: '총 구독자', value: '11,300', icon: <Users size={20} />, color: 'olive' },
                    { label: '이번 달 업로드', value: '8개', icon: <TrendingUp size={20} />, color: 'pink' },
                ].map((stat, i) => (
                    <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.color === 'pink' ? 'bg-pink-100 text-pink-500' : 'bg-green-100 text-green-600'
                            }`}>
                            {stat.icon}
                        </div>
                        <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
                        <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* 채널 추가/수정 폼 */}
            {showForm && (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-pink-200">
                    <h2 className="font-semibold text-gray-700 mb-4">
                        {editId !== null ? '채널 수정' : '새 채널 추가'}
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        {[
                            { label: '채널명', key: 'name', placeholder: '예: 여행 브이로그' },
                            { label: '핸들명', key: 'handle', placeholder: '예: @travel_vlog' },
                            { label: '구독자 수', key: 'subscribers', placeholder: '예: 8,200' },
                            { label: '채널 URL', key: 'url', placeholder: 'https://youtube.com/@...' },
                            { label: '카테고리', key: 'category', placeholder: '예: 여행, IT, 요리' },
                            { label: '메모', key: 'memo', placeholder: '예: 주 2회 업로드' },
                        ].map(field => (
                            <div key={field.key}>
                                <label className="text-sm font-medium text-gray-600 mb-1 block">{field.label}</label>
                                <input
                                    type="text"
                                    value={form[field.key as keyof typeof form]}
                                    onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                                    placeholder={field.placeholder}
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button onClick={handleSubmit}
                            className="px-4 py-2 bg-[#7C8C4E] text-white rounded-xl text-sm font-medium hover:opacity-90 transition">
                            {editId !== null ? '수정 완료' : '추가'}
                        </button>
                        <button onClick={() => { setShowForm(false); setEditId(null) }}
                            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
                            취소
                        </button>
                    </div>
                </div>
            )}

            {/* 채널 목록 테이블 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="grid grid-cols-6 gap-4 px-6 py-3 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <span className="col-span-2">채널명</span>
                    <span>핸들명</span>
                    <span>구독자</span>
                    <span>카테고리</span>
                    <span>관리</span>
                </div>
                {channels.map((channel, i) => (
                    <div key={channel.id} className={`grid grid-cols-6 gap-4 px-6 py-4 items-center ${i !== channels.length - 1 ? 'border-b border-gray-100' : ''}`}>
                        <div className="col-span-2">
                            <p className="text-sm font-medium text-gray-800">{channel.name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{channel.memo}</p>
                        </div>
                        <span className="text-sm text-gray-600">{channel.handle}</span>
                        <span className="text-sm text-gray-600">{channel.subscribers}</span>
                        <span className="text-xs bg-pink-100 text-pink-600 px-2 py-1 rounded-full w-fit">{channel.category}</span>
                        <div className="flex gap-2">
                            <a href={channel.url} target="_blank" rel="noopener noreferrer"
                                className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-gray-600">
                                <ExternalLink size={14} />
                            </a>
                            <button onClick={() => handleEdit(channel)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-blue-500">
                                <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDelete(channel.id)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-red-500">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}
                {channels.length === 0 && (
                    <div className="px-6 py-12 text-center text-gray-400 text-sm">
                        아직 채널이 없어요. 위에서 채널을 추가해보세요!
                    </div>
                )}
            </div>
        </div>
    )
}
