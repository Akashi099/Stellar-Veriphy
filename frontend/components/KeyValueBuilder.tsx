"use client";

import { useState } from "react";

interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  type: "string" | "number" | "boolean" | "object";
}

/** Scalar metadata values supported by the key-value builder. */
export type MetadataScalar = string | number | boolean;

/** Parsed metadata value — scalar, nested object, or array of scalars. */
export type MetadataValue = MetadataScalar | Record<string, MetadataScalar> | MetadataScalar[];

interface KeyValueBuilderProps {
  value?: Record<string, MetadataValue>;
  onChange?: (value: Record<string, MetadataValue>) => void;
}

export function KeyValueBuilder({ value = {}, onChange }: KeyValueBuilderProps) {
  const [pairs, setPairs] = useState<KeyValuePair[]>(
    Object.entries(value).map(([key, val], idx) => ({
      id: `${idx}`,
      key,
      value: typeof val === "string" ? val : JSON.stringify(val),
      type: typeof val === "boolean" ? "boolean" : typeof val === "number" ? "number" : "string",
    }))
  );

  const handleAddPair = () => {
    const newPair: KeyValuePair = {
      id: Date.now().toString(),
      key: "",
      value: "",
      type: "string",
    };
    setPairs([...pairs, newPair]);
  };

  const handleRemovePair = (id: string) => {
    const updated = pairs.filter((p) => p.id !== id);
    setPairs(updated);
    updateParent(updated);
  };

  const handleUpdatePair = (id: string, field: keyof KeyValuePair, val: string) => {
    const updated = pairs.map((p) => (p.id === id ? { ...p, [field]: val } : p));
    setPairs(updated);
    updateParent(updated);
  };

  const updateParent = (pairs: KeyValuePair[]) => {
    const result: Record<string, MetadataValue> = {};
    pairs.forEach((p) => {
      if (p.key) {
        if (p.type === "number") {
          result[p.key] = parseFloat(p.value) || 0;
        } else if (p.type === "boolean") {
          result[p.key] = p.value === "true";
        } else if (p.type === "object") {
          try {
            result[p.key] = JSON.parse(p.value) as Record<string, MetadataScalar>;
          } catch {
            result[p.key] = p.value;
          }
        } else {
          result[p.key] = p.value;
        }
      }
    });
    onChange?.(result);
  };

  return (
    <div className="space-y-3">
      {pairs.map((pair) => (
        <div key={pair.id} className="flex gap-2 items-end">
          <input
            type="text"
            placeholder="Key"
            value={pair.key}
            onChange={(e) => handleUpdatePair(pair.id, "key", e.target.value)}
            className="flex-1 px-3 py-2 border rounded bg-white dark:bg-gray-800 text-black dark:text-white"
          />
          <select
            value={pair.type}
            onChange={(e) =>
              handleUpdatePair(pair.id, "type", e.target.value as KeyValuePair["type"])
            }
            className="px-3 py-2 border rounded bg-white dark:bg-gray-800 text-black dark:text-white"
          >
            <option value="string">String</option>
            <option value="number">Number</option>
            <option value="boolean">Boolean</option>
            <option value="object">JSON</option>
          </select>
          <input
            type={pair.type === "number" ? "number" : "text"}
            placeholder="Value"
            value={pair.value}
            onChange={(e) => handleUpdatePair(pair.id, "value", e.target.value)}
            className="flex-1 px-3 py-2 border rounded bg-white dark:bg-gray-800 text-black dark:text-white"
          />
          <button
            onClick={() => handleRemovePair(pair.id)}
            className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        onClick={handleAddPair}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Add Pair
      </button>
    </div>
  );
}
