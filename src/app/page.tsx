import { MadeWithDyad } from "@/components/made-with-dyad";
import LogViewer from "@/components/LogViewer/LogViewer";

export default function Home() {
  return (
    <div className="h-screen p-3 sm:p-6">
      <main className="mx-auto max-w-7xl h-full">
        <h1 className="text-xl sm:text-2xl font-semibold mb-3">Log Analyzer</h1>
        <div className="h-[calc(100%-2.5rem)]"> 
          <LogViewer />
        </div>
      </main>
      <div className="mt-4">
        <MadeWithDyad />
      </div>
    </div>
  );
}