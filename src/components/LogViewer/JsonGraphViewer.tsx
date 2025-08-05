"use client";

import * as React from "react";
import * as d3 from "d3";

type Props = {
  data: unknown;
  className?: string;
  maxNodes?: number;
};

type FlatNode = { id: string; parentId?: string; key?: string; kind: "object" | "array" | "leaf"; valuePreview?: string };

function previewValue(val: unknown, max = 80): string {
  if (val === null) return "null";
  const t = Object.prototype.toString.call(val).slice(8, -1);
  if (t === "String") return JSON.stringify(val).slice(0, max);
  if (t === "Number" || t === "Boolean") return String(val);
  if (t === "Undefined") return "undefined";
  return "";
}

function flattenJsonToNodes(value: unknown, rootId = "root", maxNodes = 500): FlatNode[] {
  const out: FlatNode[] = [];
  let count = 0;

  const push = (n: FlatNode) => {
    if (count >= maxNodes) return;
    out.push(n);
    count++;
  };

  const walk = (val: unknown, id: string, parentId?: string, key?: string) => {
    if (count >= maxNodes) return;

    let kind: FlatNode["kind"] = "leaf";
    if (val && typeof val === "object") {
      kind = Array.isArray(val) ? "array" : "object";
    }

    const vprev = kind === "leaf" ? previewValue(val) : undefined;
    push({ id, parentId, key, kind, valuePreview: vprev });

    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length && count < maxNodes; i++) {
          walk((val as unknown[])[i], `${id}.${i}`, id, String(i));
        }
      } else {
        const obj = val as Record<string, unknown>;
        for (const k of Object.keys(obj)) {
          if (count >= maxNodes) break;
          walk(obj[k], `${id}.${k}`, id, k);
        }
      }
    }
  };

  walk(value, rootId, undefined, "root");
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

    // Gerarchia
    const stratifier = d3
      .stratify<FlatNode>()
      .id((d) => d.id)
      .parentId((d) => d.parentId ?? null);

    let root: d3.HierarchyNode<FlatNode>;
    try {
      root = stratifier(flat);
    } catch {
      const g = svg.append("g");
      g.append("text").text("Grafico non disponibile").attr("x", 10).attr("y", 20);
      return;
    }

    // Layout
    const nodeW = 200;
    const nodeH = 70;
    const treeLayout = d3.tree<FlatNode>().nodeSize([nodeH, nodeW]);
    const treeRoot = treeLayout(root as unknown as d3.HierarchyPointNode<FlatNode>);

    // Bounds
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
    const width = Math.max(600, maxY - minY + 220);
    const height = Math.max(400, maxX - minX + 220);
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const g = svg.append("g").attr("transform", `translate(${110 - minY}, ${110 - minX})`);

    // Pan/zoom
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on("zoom", (event) => {
          g.attr("transform", event.transform.toString());
        }) as any
    );

    // Links
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
      .attr("stroke-width", 1.1)
      .attr("opacity", 0.65);

    // Nodes
    const nodes = g
      .append("g")
      .selectAll("g.node")
      .data(treeRoot.descendants())
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (n: any) => `translate(${n.y},${n.x})`);

    // Card
    nodes
      .append("rect")
      .attr("x", -90)
      .attr("y", -16)
      .attr("rx", 8)
      .attr("ry", 8)
      .attr("width", 180)
      .attr("height", 32)
      .attr("fill", "hsl(var(--card))")
      .attr("stroke", "hsl(var(--border))");

    // Label logic
    const labelFor = (d: FlatNode) => {
      const key = d.key ?? "";
      if (d.kind === "object") {
        // solo chiave + tipo
        return key === "root" ? "{ }" : `${key}  { }`;
      }
      if (d.kind === "array") {
        return key === "root" ? "[ ]" : `${key}  [ ]`;
      }
      // foglia: chiave: valore
      if (key === "root") return d.valuePreview ?? "";
      return d.valuePreview ? `${key}: ${d.valuePreview}` : `${key}`;
    };

    nodes
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 10.5)
      .attr("fill", "hsl(var(--foreground))")
      .text((n: any) => labelFor(n.data));
  }, [data, maxNodes]);

  return (
    <div className={["w-full h-[60vh] border rounded-md bg-background", className].filter(Boolean).join(" ")}>
      <svg ref={ref} className="w-full h-full" />
    </div>
  );
}