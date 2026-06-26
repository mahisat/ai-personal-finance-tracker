// src/components/CategorySelect.tsx
// Grouped <select> that renders parent categories as <optgroup>
// and subcategories as <option> inside them.

import { useEffect, useState } from "react";
import { api, type Category } from "../api/client";

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export default function CategorySelect({
  value,
  onChange,
  className = "",
  placeholder = "— Select category —",
}: Props) {
  const [tree, setTree] = useState<Category[]>([]);

  useEffect(() => {
    api.categories
      .list()
      .then(setTree)
      .catch(() => {});
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`border border-slate-200 rounded-lg px-3 py-2 text-sm
        focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white ${className}`}
    >
      <option value="">{placeholder}</option>
      {tree.map((parent) =>
        (parent.children ?? []).length > 0 ? (
          <optgroup key={parent.id} label={parent.name}>
            {(parent.children ?? []).map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </optgroup>
        ) : (
          <option key={parent.id} value={parent.id}>
            {parent.name}
          </option>
        ),
      )}
    </select>
  );
}
