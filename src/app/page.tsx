import { MadeWithDyad } from "@/components/made-with-dyad";
import LogViewer from "@/components/LogViewer/LogViewer";

export default function Home() {
  return (
    <div className="h-screen p-3 sm:p-6 flex flex-col">
      <main className="mx-auto max-w-7xl w-full flex-1 min-h-0 flex flex-col">
        <h1 className="text-xl sm:text-2xl font-semibold mb-3 shrink-0">Log Analyzer</h1>
        <div className="flex-1 min-h-0"> 
          <LogViewer />
        </div>
      </main>
      <div className="mt-4 shrink-0">
        <MadeWithDyad />
      </div>
    </div>
  );
}