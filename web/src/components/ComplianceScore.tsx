import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, AlertCircle, TrendingUp } from "lucide-react";

interface ComplianceScoreProps {
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    errorCount: number;
    warningCount: number;
    compliancePercentage: number;
    checksByCategory: Array<{
      category: string;
      total: number;
      passed: number;
      failed: number;
    }>;
  };
}

export const ComplianceScore: React.FC<ComplianceScoreProps> = ({ summary }) => {
  const pieData = [
    { name: "Passed", value: summary.passedChecks, color: "#10b981" },
    { name: "Failed", value: summary.failedChecks, color: "#ef4444" },
  ];

  const getComplianceColor = (percentage: number) => {
    if (percentage >= 90) return "text-green-600";
    if (percentage >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getComplianceGradient = (percentage: number) => {
    if (percentage >= 90) return "from-green-500 to-green-600";
    if (percentage >= 70) return "from-yellow-500 to-yellow-600";
    return "from-red-500 to-red-600";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white rounded-xl shadow-lg p-6 border border-gray-200"
    >
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-6 h-6 text-blue-600" />
        <h3 className="text-xl font-bold text-gray-900">Validation Summary</h3>
      </div>

      {/* Main Compliance Score */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Left: Circular Progress */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-48 h-48">
            <svg className="transform -rotate-90 w-48 h-48">
              <circle
                cx="96"
                cy="96"
                r="88"
                stroke="currentColor"
                strokeWidth="12"
                fill="transparent"
                className="text-gray-200"
              />
              <motion.circle
                cx="96"
                cy="96"
                r="88"
                stroke="url(#gradient)"
                strokeWidth="12"
                fill="transparent"
                strokeLinecap="round"
                initial={{ strokeDashoffset: 553 }}
                animate={{ strokeDashoffset: 553 - (553 * summary.compliancePercentage) / 100 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                style={{ strokeDasharray: "553" }}
              />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop
                    offset="0%"
                    stopColor={summary.compliancePercentage >= 90 ? "#10b981" : summary.compliancePercentage >= 70 ? "#f59e0b" : "#ef4444"}
                  />
                  <stop
                    offset="100%"
                    stopColor={summary.compliancePercentage >= 90 ? "#059669" : summary.compliancePercentage >= 70 ? "#d97706" : "#dc2626"}
                  />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, duration: 0.5, type: "spring" }}
                className={`text-5xl font-bold ${getComplianceColor(summary.compliancePercentage)}`}
              >
                {summary.compliancePercentage}%
              </motion.span>
              <span className="text-sm text-gray-600 font-medium mt-1">Compliance</span>
            </div>
          </div>
        </div>

        {/* Right: Statistics */}
        <div className="space-y-4">
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
            label="Passed Checks"
            value={summary.passedChecks}
            total={summary.totalChecks}
            color="green"
          />
          <StatCard
            icon={<XCircle className="w-5 h-5 text-red-600" />}
            label="Failed Checks"
            value={summary.failedChecks}
            total={summary.totalChecks}
            color="red"
          />
          <StatCard
            icon={<AlertCircle className="w-5 h-5 text-red-600" />}
            label="Errors"
            value={summary.errorCount}
            color="red"
          />
          <StatCard
            icon={<AlertCircle className="w-5 h-5 text-yellow-600" />}
            label="Warnings"
            value={summary.warningCount}
            color="yellow"
          />
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="border-t border-gray-200 pt-6">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Checks by Category</h4>
        <div className="space-y-3">
          {summary.checksByCategory.map((cat, idx) => (
            <motion.div
              key={cat.category}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * idx, duration: 0.3 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700">{cat.category}</span>
                <span className="text-gray-600">
                  {cat.passed}/{cat.total} passed
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(cat.passed / cat.total) * 100}%` }}
                  transition={{ delay: 0.2 * idx, duration: 0.8, ease: "easeOut" }}
                  className={`h-2 rounded-full bg-gradient-to-r ${
                    cat.passed === cat.total
                      ? "from-green-500 to-green-600"
                      : cat.passed > cat.total / 2
                      ? "from-yellow-500 to-yellow-600"
                      : "from-red-500 to-red-600"
                  }`}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  total?: number;
  color: "green" | "red" | "yellow";
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, total, color }) => {
  const bgColors = {
    green: "bg-green-50",
    red: "bg-red-50",
    yellow: "bg-yellow-50",
  };

  const borderColors = {
    green: "border-green-200",
    red: "border-red-200",
    yellow: "border-yellow-200",
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`flex items-center gap-3 p-3 rounded-lg border ${bgColors[color]} ${borderColors[color]}`}
    >
      {icon}
      <div className="flex-1">
        <p className="text-xs text-gray-600 font-medium">{label}</p>
        <p className="text-lg font-bold text-gray-900">
          {value}
          {total !== undefined && <span className="text-sm text-gray-600 font-normal"> / {total}</span>}
        </p>
      </div>
    </motion.div>
  );
};
