import { MadeWithDyad } from "@/components/made-with-dyad";
import LogViewer from "@/components/LogViewer/LogViewer";

export default function Home() {
  return (
    <div className="grid grid-rows-[1fr_20px] items-center justify-items-center min-h-screen p-4 sm:p-8 pb-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-4 row-start-1 items-stretch w-full max-w-6xl">
        <h1 className="text-2xl font-semibold">Log Analyzer</h1>
        <LogViewer />
      </main>
      <MadeWithDyad />
    </div>
  );
}