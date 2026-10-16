"use client";
import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ModuleMap } from "@/contracts";
export function ModuleGraph({
  map,
  selectedFileId,
  onSelect,
}: {
  map: ModuleMap;
  selectedFileId: string;
  onSelect: (fileId: string) => void;
}) {
  const nodes = useMemo<Node[]>(
    () => {
      const rows = { entry: 0, core: 0, middleware: 0 };
      const counts = { entry: 0, core: 0, middleware: 0 };
      for (const node of map.nodes) counts[node.kind]++;
      const maxRows = Math.max(...Object.values(counts));
      return map.nodes.map((node) => ({
        id: node.id,
        position: {
          x: node.kind === "entry" ? 30 : node.kind === "core" ? 300 : 570,
          y: ((maxRows - counts[node.kind]) / 2 + rows[node.kind]++) * 85,
        },
        data: { label: node.label },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          background: node.fileId === selectedFileId ? "#3b3021" : "#222730",
          color: node.fileId === selectedFileId ? "#efc58c" : "#c1c7d1",
          border: `1px solid ${node.fileId === selectedFileId ? "#bd9456" : "#363e49"}`,
          borderRadius: 9,
          fontSize: 12,
          padding: 12,
          width: 175,
        },
      }));
    },
    [map, selectedFileId],
  );
  const edges = useMemo<Edge[]>(
    () =>
      map.edges.map((edge) => ({
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: edge.typeOnly ? "type import" : "import",
        type: "smoothstep",
        style: {
          stroke: edge.typeOnly ? "#4b5563" : "#a08252",
          strokeDasharray: edge.typeOnly ? "4 4" : undefined,
        },
        labelStyle: { fill: "#929aa6", fontSize: 9 },
        labelBgStyle: { fill: "#191d24" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#8f7959" },
      })),
    [map],
  );
  return (
    <div className="graph-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={(_, node) =>
          onSelect(map.nodes.find((n) => n.id === node.id)!.fileId)
        }
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        colorMode="dark"
        nodesDraggable={false}
      >
        <Background color="#333944" gap={22} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div className="graph-legend">
        <span>
          <i /> Static import
        </span>
        <span>
          <i className="dashed" /> Type-only import
        </span>
      </div>
    </div>
  );
}
