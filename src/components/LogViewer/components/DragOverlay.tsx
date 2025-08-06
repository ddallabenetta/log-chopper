"use client";

import * as React from "react";

export default function DragOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background/70">
      <div className="rounded-lg border bg-card px-6 py-3 text-sm">
        Rilascia i file .log qui
      </div>
    </div>
  );
}