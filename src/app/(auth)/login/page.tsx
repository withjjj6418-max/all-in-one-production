'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Mail, Lock, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string }>({});

  const validateForm = () => {
    const errors: { email?: string; password?: string } = {};
    if (!email) {
      errors.email = '올바른 이메일을 입력해주세요';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.email = '올바른 이메일 형식이 아닙니다';
    }
    if (!password) {
      errors.password = '비밀번호를 입력해주세요';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationErrors({});

    if (!validateForm()) return;

    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        // 에러 메시지 한국어 변환
        let message = authError.message;
        if (message === 'Invalid login credentials') {
          message = '이메일 또는 비밀번호가 올바르지 않습니다';
        } else if (message === 'Email not confirmed') {
          message = '이메일 인증이 필요합니다';
        }
        setError(message);
      } else {
        // 로그인 성공
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      setError('로그인 중 알 수 없는 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      {/* 배경 장식 요소 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-brand-pink/10 blur-3xl" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full bg-brand-olive/10 blur-3xl" />
      </div>

      <div className="w-full max-w-md space-y-8 relative z-10">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            Welcome Back
          </h1>
          <p className="mt-2 text-muted-foreground">
            계정에 로그인하여 작업을 계속하세요
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-xl p-8 backdrop-blur-sm bg-opacity-80">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                이메일 주소
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`flex h-11 w-full rounded-lg border bg-background px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all ${
                    validationErrors.email ? 'border-destructive' : 'border-input'
                  }`}
                  disabled={loading}
                />
              </div>
              {validationErrors.email && (
                <p className="text-xs text-destructive mt-1">{validationErrors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  비밀번호
                </label>
                <button type="button" className="text-xs text-brand-olive hover:text-brand-olive-dark font-medium transition-colors">
                  비밀번호를 잊으셨나요?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`flex h-11 w-full rounded-lg border bg-background px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-olive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all ${
                    validationErrors.password ? 'border-destructive' : 'border-input'
                  }`}
                  disabled={loading}
                />
              </div>
              {validationErrors.password && (
                <p className="text-xs text-destructive mt-1">{validationErrors.password}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-brand-olive text-white hover:bg-brand-olive-dark h-12 w-full shadow-lg shadow-brand-olive/20 active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  로그인 중...
                </>
              ) : (
                '로그인'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-border text-center">
            <p className="text-sm text-muted-foreground">
              계정이 없으신가요? <br />
              <span className="text-brand-olive font-semibold mt-1 inline-block">
                초대받은 사용자만 사용 가능합니다
              </span>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} All-in-one Production. All rights reserved.
        </p>
      </div>
    </div>
  );
}

