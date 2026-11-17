import { Suspense } from "react";
import { LoginScreen } from "@/features/auth/login-screen";

export const metadata = { title: "로그인 | MAMA" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** /login?next=돌아갈경로&error=이유 */
export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  // 주소의 값은 요청마다 달라서 Suspense 안에서 기다린다(Cache Components).
  return <Suspense fallback={null}><Resolve searchParams={searchParams} /></Suspense>;
}
async function Resolve({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <LoginScreen next={first(params.next)} error={first(params.error)} />;
}
