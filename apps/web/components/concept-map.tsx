"use client";

import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, type NodeProps } from "@xyflow/react";
import { Check, CircleAlert, CircleDotDashed } from "lucide-react";
import { useMemo } from "react";
import { learningConcepts } from "@/lib/demo-data";

type ConceptData = { label: string; status: string };

function ConceptNode({ data }: NodeProps) {
  const concept = data as ConceptData;
  const Icon = concept.status === "mastered" ? Check : concept.status === "misconception" ? CircleAlert : CircleDotDashed;
  return (
    <div className={`concept-node concept-${concept.status}`}>
      <Handle type="target" position={Position.Left} />
      <Icon size={15} />
      <span>{concept.label}</span>
      <small>{concept.status.replace("_", " ")}</small>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { concept: ConceptNode };

export function ConceptMap({ completed = false }: { completed?: boolean }) {
  const nodes = useMemo(() => learningConcepts.map((concept) => ({
    id: concept.id,
    type: "concept",
    position: { x: concept.x, y: concept.y },
    data: { label: concept.label, status: completed && concept.id === "potential" ? "practicing" : concept.status },
  })), [completed]);
  const edges = useMemo(() => [
    { id: "e1", source: "field", target: "potential" },
    { id: "e2", source: "work", target: "potential" },
    { id: "e3", source: "potential", target: "equipotential" },
    { id: "e4", source: "potential", target: "capacitance" },
    { id: "e5", source: "capacitance", target: "dielectrics" },
  ].map((edge) => ({ ...edge, animated: edge.source === "potential", style: { stroke: "#a5aaa4", strokeWidth: 1.5 } })), []);

  return (
    <div className="concept-map" aria-label="Physics concept knowledge map">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.6} maxZoom={1.3} proOptions={{ hideAttribution: true }}>
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d8d6cf" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
