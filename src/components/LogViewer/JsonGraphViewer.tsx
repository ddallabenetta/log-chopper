"use client";

import * as React from "react";
import * as d3 from "d3";

type Props = {
  data: unknown;
  className?: string;
  maxNodes?: number;
};

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
    const type = Object.prototype.toString.call(val).slice(8, -1);
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

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const flat = flattenJsonToNodes(data, "root", maxNodes);
    if (flat.length === 0) return;

    // Costruisce gerarchia
    const stratifier = d3
      .stratify<{ id: string; parentId?: string }>()
      .id((d) => d.id)
      .parentId((d) => d.parentId ?? null);

    let root: d3.HierarchyNode<{ id: string; parentId?: string }>;
    try {
      root = stratifier(flat);
    } catch {
      const g = svg.append("g");
      g.append("text").text("Grafico non disponibile").attr("x", 10).attr("y", 20);
      return;
    }

    // Layout ad albero
    // width per colonna, height per riga
    const nodeW = 180;
    const nodeH = 70;
    const treeLayout = d3.tree<unknown>().nodeSize([nodeH, nodeW]);

    const treeRoot = treeLayout(root as unknown as d3.HierarchyPointNode<unknown>);

    // Compute bounds
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    treeRoot.each((n: any) => {
      const x = n.x as number;
      const y = n.y as number;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
    const width = Math.max(600, maxY - minY + 200);
    const height = Math.max(400, maxX - minX + 200);
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g").attr("transform", `translate(${100 - minY}, ${100 - minX})`);

    // Pan/zoom
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on("zoom", (event) => {
          g.attr("transform", event.transform.toString());
        }) as any
    );

    // Link curve
    const linkGen = d3
      .linkHorizontal<any, any>()
      .x((d) => d.y)
      .y((d) => d.x);

    const links = treeRoot.links();

    g.append("g")
      .selectAll("path")
      .data(links)
      .enter()
      .append("path")
      .attr("d", linkGen as any)
      .attr("fill", "none")
      .attr("stroke", "hsl(var(--muted-foreground))")
      .attr("stroke-width", 1.2)
      .attr("opacity", 0.7);

    // Nodes
    const nodes = g
      .append("g")
      .selectAll("g.node")
      .data(treeRoot.descendants())
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (n: any) => `translate(${n.y},${n.x})`);

    nodes
      .append("rect")
      .attr("x", -80)
      .attr("y", -14)
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("width", 160)
      .attr("height", 28)
      .attr("fill", "hsl(var(--card))")
      .attr("stroke", "hsl(var(--border))");

    const labelMap = new Map(flat.map((n) => [n.id, n.label]));

    nodes
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 10)
      .attr("fill", "hsl(var(--foreground))")
      .text((n: any) => labelMap.get(n.data.id) ?? n.data.id);
  }, [data, maxNodes]);

  return (
    <div className={["w-full h-[60vh] border rounded-md bg-background", className].filter(Boolean).join(" ")}>
      <svg ref={ref} className="w-full h-full" />
    </div>
  );
}