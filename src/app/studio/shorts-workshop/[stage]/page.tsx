import {notFound} from "next/navigation";
export default async function Page({params}: {params: Promise<{stage: string}>}) { const {stage} = await params; if (!["discover", "source", "script", "voice", "captions", "premiere", "outputs"].includes(stage)) notFound(); return null; }
