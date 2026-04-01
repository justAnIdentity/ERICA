import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, ChevronDown, ChevronRight } from "lucide-react";
import { ValidationCheckCard } from "./ValidationCheckCard";

interface ValidationCheck {
  checkId: string;
  checkName: string;
  passed: boolean;
  category: string;
  subcategory?: string;
  field?: string;
  expectedValue?: string;
  actualValue?: string;
  details?: string;
  severity: "ERROR" | "WARNING";
  issue?: string;
  suggestedFix?: string;
  specReference?: {
    spec: string;
    section?: string;
    url?: string;
  };
}

interface ChecksDisplayProps {
  checks: ValidationCheck[];
  title: string;
}

type FilterType = "all" | "passed" | "failed" | "errors" | "warnings";

export const ChecksDisplay: React.FC<ChecksDisplayProps> = ({ checks, title }) => {
  const [filter, setFilter] = useState<FilterType>("all");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // Group checks by category
  const checksByCategory = checks.reduce((acc, check) => {
    if (!acc[check.category]) {
      acc[check.category] = [];
    }
    acc[check.category].push(check);
    return acc;
  }, {} as Record<string, ValidationCheck[]>);

  // Filter checks
  const filterChecks = (checks: ValidationCheck[]): ValidationCheck[] => {
    switch (filter) {
      case "passed":
        return checks.filter((c) => c.passed);
      case "failed":
        return checks.filter((c) => !c.passed);
      case "errors":
        return checks.filter((c) => !c.passed && c.severity === "ERROR");
      case "warnings":
        return checks.filter((c) => !c.passed && c.severity === "WARNING");
      default:
        return checks;
    }
  };

  const toggleCategory = (category: string) => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category);
    } else {
      newCollapsed.add(category);
    }
    setCollapsedCategories(newCollapsed);
  };

  const getFilterCount = (filterType: FilterType): number => {
    switch (filterType) {
      case "passed":
        return checks.filter((c) => c.passed).length;
      case "failed":
        return checks.filter((c) => !c.passed).length;
      case "errors":
        return checks.filter((c) => !c.passed && c.severity === "ERROR").length;
      case "warnings":
        return checks.filter((c) => !c.passed && c.severity === "WARNING").length;
      default:
        return checks.length;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Filter className="w-4 h-4" />
          <span>Filter:</span>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        <FilterButton
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
          count={getFilterCount("all")}
        />
        <FilterButton
          active={filter === "passed"}
          onClick={() => setFilter("passed")}
          label="Passed"
          count={getFilterCount("passed")}
          color="green"
        />
        <FilterButton
          active={filter === "failed"}
          onClick={() => setFilter("failed")}
          label="Failed"
          count={getFilterCount("failed")}
          color="red"
        />
        <FilterButton
          active={filter === "errors"}
          onClick={() => setFilter("errors")}
          label="Errors"
          count={getFilterCount("errors")}
          color="red"
        />
        <FilterButton
          active={filter === "warnings"}
          onClick={() => setFilter("warnings")}
          label="Warnings"
          count={getFilterCount("warnings")}
          color="yellow"
        />
      </div>

      {/* Checks Grouped by Category */}
      <div className="space-y-4">
        {Object.entries(checksByCategory).map(([category, categoryChecks]) => {
          const filteredChecks = filterChecks(categoryChecks);
          if (filteredChecks.length === 0) return null;

          const isCollapsed = collapsedCategories.has(category);
          const passedCount = categoryChecks.filter((c) => c.passed).length;
          const totalCount = categoryChecks.length;

          return (
            <div key={category} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition"
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{ rotate: isCollapsed ? 0 : 90 }}
                    transition={{ duration: 0.2 }}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-600" />
                    )}
                  </motion.div>
                  <span className="font-semibold text-gray-900">{category}</span>
                  <span className="text-sm text-gray-600">
                    ({passedCount}/{totalCount} passed)
                  </span>
                </div>

                {/* Mini Progress Bar */}
                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      passedCount === totalCount
                        ? "bg-green-500"
                        : passedCount > totalCount / 2
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${(passedCount / totalCount) * 100}%` }}
                  />
                </div>
              </button>

              {/* Category Checks */}
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="border-t border-gray-200"
                  >
                    <div className="p-4 space-y-3">
                      {filteredChecks.map((check, idx) => (
                        <ValidationCheckCard key={check.checkId} check={check} index={idx} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* No Results Message */}
      {Object.entries(checksByCategory).every(([_, checks]) => filterChecks(checks).length === 0) && (
        <div className="text-center py-8 text-gray-500">
          <p className="text-sm">No checks match the current filter</p>
        </div>
      )}
    </div>
  );
};

interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: "green" | "red" | "yellow";
}

const FilterButton: React.FC<FilterButtonProps> = ({ active, onClick, label, count, color }) => {
  const activeColors = {
    green: "bg-green-100 border-green-500 text-green-800",
    red: "bg-red-100 border-red-500 text-red-800",
    yellow: "bg-yellow-100 border-yellow-500 text-yellow-800",
  };

  const inactiveColors = {
    green: "bg-white border-gray-300 text-gray-700 hover:bg-green-50",
    red: "bg-white border-gray-300 text-gray-700 hover:bg-red-50",
    yellow: "bg-white border-gray-300 text-gray-700 hover:bg-yellow-50",
  };

  const defaultActive = "bg-blue-100 border-blue-500 text-blue-800";
  const defaultInactive = "bg-white border-gray-300 text-gray-700 hover:bg-gray-50";

  const colorClass = active
    ? color
      ? activeColors[color]
      : defaultActive
    : color
    ? inactiveColors[color]
    : defaultInactive;

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition ${colorClass}`}
    >
      {label} <span className="font-bold">({count})</span>
    </motion.button>
  );
};
