import React from "react";

export type ComplianceLevel = "compliant" | "warning" | "error";

interface ComplianceStatusProps {
  level: ComplianceLevel;
  score: number;
  message: string;
  details?: string;
}

export const ComplianceStatus: React.FC<ComplianceStatusProps> = ({
  level,
  score,
  message,
  details,
}) => {
  const statusConfig = {
    compliant: {
      badgeClass: "status-badge status-badge--success",
      bgColor: "bg-green-50",
      borderColor: "border-green-300",
      textColor: "text-green-900",
      badgeColor: "bg-green-100 text-green-800",
      label: "COMPLIANT",
    },
    warning: {
      badgeClass: "status-badge status-badge--warning",
      bgColor: "bg-yellow-50",
      borderColor: "border-yellow-300",
      textColor: "text-yellow-900",
      badgeColor: "bg-yellow-100 text-yellow-800",
      label: "NEEDS ATTENTION",
    },
    error: {
      badgeClass: "status-badge status-badge--error",
      bgColor: "bg-red-50",
      borderColor: "border-red-300",
      textColor: "text-red-900",
      badgeColor: "bg-red-100 text-red-800",
      label: "NOT COMPLIANT",
    },
  };

  const config = statusConfig[level];

  return (
    <div
      className={`${config.bgColor} ${config.borderColor} border-2 rounded-xl p-6 shadow-sm`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4 flex-1">
          <div className={`${config.badgeClass} text-xl`}>{level === 'compliant' ? '✓' : level === 'warning' ? '⚠' : '✕'}</div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span
                className={`${config.badgeColor} px-3 py-1 rounded-full text-sm font-bold`}
              >
                {config.label}
              </span>
              <span className={`text-3xl font-bold ${config.textColor}`}>
                {score}%
              </span>
            </div>
            <p className={`text-lg font-semibold ${config.textColor} mb-1`}>
              {message}
            </p>
            {details && (
              <p className="text-sm text-gray-700 mt-2">{details}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
