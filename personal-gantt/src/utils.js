// 날짜 관련 유틸리티
export const parseDate = (dateStr) => new Date(dateStr + 'T00:00:00');

export const formatDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const getDaysBetween = (start, end) =>
  Math.round((parseDate(end) - parseDate(start)) / (1000 * 60 * 60 * 24));

export const formatTimestamp = (iso) => {
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
};

// 마감 상태 체크: 'ok' | 'today' | 'overdue'
export const getDeadlineStatus = (task) => {
  if (task.status === 'done') return 'ok';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(task.end + 'T00:00:00');

  if (endDate < today) return 'overdue';  // 초과
  if (endDate.getTime() === today.getTime()) return 'today';  // 당일
  return 'ok';
};

// 기본 보기 범위 (오늘 ~ 1달 후)
export const getDefaultViewRange = () => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const start = `${y}-${m}-${d}`;
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + 1);
  const ey = endDate.getFullYear();
  const em = String(endDate.getMonth() + 1).padStart(2, '0');
  const ed = String(endDate.getDate()).padStart(2, '0');
  return { start, end: `${ey}-${em}-${ed}` };
};

// 파일 크기 포맷
export const formatFileSize = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// 클립보드 복사 (fallback 포함)
export const copyToClipboard = (text, onSuccess, onError) => {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      if (onSuccess) onSuccess(text);
    }).catch(() => {
      fallbackCopyText(text, onSuccess, onError);
    });
  } else {
    fallbackCopyText(text, onSuccess, onError);
  }
};

const fallbackCopyText = (text, onSuccess, onError) => {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  document.body.appendChild(textArea);
  textArea.select();
  try {
    document.execCommand('copy');
    if (onSuccess) onSuccess(text);
  } catch (err) {
    if (onError) onError(err);
  }
  document.body.removeChild(textArea);
};
