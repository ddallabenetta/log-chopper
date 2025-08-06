import LogViewer from "../components/LogViewer/LogViewer";

export default function Home() {
  return (
    <div className="h-[calc(100vh-56px)] w-screen overflow-hidden"> 
      <LogViewer />
    </div>
  );
}