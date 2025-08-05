"use client";

import * as React from "react";
import * as d3 from "d3";
import { sugiyama, decrossTwoLayer, coordCenter, Dag, dagStratify } from "d3-dag";

type Props = {
  data: unknown; // oggetto/array già parsato
  className?: string;
  maxNodes?: number; // limite di sicurezza per JSON enormi
};

// Converte JSON in una lista di nodi con id e parentId per d3-dag
type FlatNode = { id: string; parentId?: string; label: string };

function flattenJsonToNodes(value: unknown, rootId = "root", maxNodes = 500): FlatNode[] {
  const out: FlatNode[] = [];
  let count = 0;

  const push = (n: FlatNode) => {
    if (count >= maxNodes) return;
    out.push(n);
    count++;
  };

  const walk = (val: unknown, id: string, parentId?: string) => {
    if (count >= maxNodes) return;
    const type = Object.prototype.toString.call(val).slice(8, -1); // es. Object, Array, String
    let label = "";
    if (val === null) label = "null";
    else if (type === "Object") label = "{ }";
    else if (type === "Array") label = "[ ]";
    else if (type === "String") label = JSON.stringify(val).slice(0, 80);
    else label = String(val).slice(0, 80);

    push({ id, parentId, label });

    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length && count < maxNodes; i++) {
          walk((val as unknown[])[i], `${id}.${i}`, id);
        }
      } else {
        const obj = val as Record<string, unknown>;
        for (const k of Object.keys(obj)) {
          if (count >= maxNodes) break;
          walk(obj[k], `${id}.${k}`, id);
        }
      }
    }
  };

  walk(value, rootId, undefined);
  return out;
}

export default function JsonGraphViewer({ data, className, maxNodes = 500 }: Props) {
  const ref = React.useRef<SVGSVGElement | null>(null);

  React.useEffect(() => {
    if (!ref.current) return;

    // Clean
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    // Flatten and build dag
    const flat = flattenJsonToNodes(data, "root", maxNodes);
    if (flat.length === 0) return;

    // d3-dag expects an array of {id, parentIds[]} or use dagStratify with parentId
    const dagInput = flat.map((n) => ({ id: n.id, parentIds: n.parentId ? [n.parentId] : [] }));

    let dag: Dag<{ id: string }>;
    try {
      dag = dagStratify()(dagInput);
    } catch {
      // fallback: single node
      const g = svg.append("g");
      g.append("text").text("Grafico non disponibile").attr("x", 10).attr("y", 20);
      return;
    }

    // Layout sugiyama
    const layout = sugiyama()
      .layering(d3.layeringLongestPath())
      .decross(decrossTwoLayer())
      .coord(coordCenter())
      .nodeSize(() => [24, 110]); // [height, width]

    layout(dag);

    // compute bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of dag.nodes()) {
      const x = (n as any).x as number;
      const y = (n as any).y as number;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const width = Math.max(600, (maxY - minY) + 200);
    const height = Math.max(400, (maxX - minX) + 200);
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g");

    // pan/zoom
    svg.call(d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
      g.attr("transform", event.transform.toString());
    }) as any);

    // Edges
    const line = d3.line<{ x: number; y: number }>()
      .curve(d3.curveCatmullRom);

    g.append("g")
      .selectAll("path")
      .data(dag.links())
      .enter()
      .append("path")
      .attr("d", (l: any) => {
        const points = [
          { x: l.source.x, y: l.source.y + 50 },
          { x: (l.source.x + l.target.x) / 2, y: (l.source.y + l.target.y) / 2 },
          { x: l.target.x, y: l.target.y - 50 },
        ];
        return line(points as any) || "";
      })
      .attr("fill", "none")
      .attr("stroke", "hsl(var(--muted-foreground))")
      .attr("stroke-width", 1.2)
      .attr("opacity", 0.7);

    // Nodes
    const nodes = g.append("g")
      .selectAll("g.node")
      .data(dag.nodes())
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (n: any) => `translate(${n.y},${n.x})`);

    nodes.append("rect")
      .attr("x", -80)
      .attr("y", -14)
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("width", 160)
      .attr("height", 28)
      .attr("fill", "hsl(var(--card))")
      .attr("stroke", "hsl(var(--border))");

    // label lookup
    const labelMap = new Map(flat.map(n => [n.id, n.label]));

    nodes.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 10)
      .attr("fill", "hsl(var(--foreground))")
      .text((n: any) => labelMap.get(n.data.id) ?? n.data.id);

  }, [data, maxNodes]);

  return (
    <div className={["w-full h-[60vh] border rounded-md bg-background"].filter(Boolean).join(" ")}>
      <svg ref={ref} className="w-full h-full" />
    </div>
  );
}