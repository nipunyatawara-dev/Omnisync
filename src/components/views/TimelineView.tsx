"use client";

import Loader from "@/components/Loader";
import Tooltip from "@/components/Tooltip";
import ContributionHeatmap from "@/components/ContributionHeatmap";
import type { RepoCommit } from "@/types/dashboard";
import { MONTH_NAMES } from "@/types/dashboard";
import { useMemo } from "react";

interface TimelineViewProps {
  allCommits: RepoCommit[];
  isTimelineLoading: boolean;
  selectedCalendarDate: string | null;
  setSelectedCalendarDate: (date: string | null) => void;
  calendarYear: number;
  setCalendarYear: React.Dispatch<React.SetStateAction<number>>;
  calendarMonth: number;
  setCalendarMonth: React.Dispatch<React.SetStateAction<number>>;
  isYearlyCalendarExpanded: boolean;
  setIsYearlyCalendarExpanded: (expanded: boolean) => void;
  contributionDays: Date[];
  commitCountsByDate: Record<string, number>;
  totalCommitsLastYear: number;
  monthLabels: { text: string; colIdx: number }[];
  repoStartYear: number;
  currentYear: number;
  formatLocalDate: (date: Date) => string;
  handleSquareClick: (dateString: string, date: Date) => void;
  getContributionColor: (count: number) => string;
}

export default function TimelineView({
  allCommits,
  isTimelineLoading,
  selectedCalendarDate,
  setSelectedCalendarDate,
  calendarYear,
  setCalendarYear,
  calendarMonth,
  setCalendarMonth,
  isYearlyCalendarExpanded,
  setIsYearlyCalendarExpanded,
  contributionDays,
  commitCountsByDate,
  totalCommitsLastYear,
  monthLabels,
  repoStartYear,
  currentYear,
  formatLocalDate,
  handleSquareClick,
  getContributionColor,
}: TimelineViewProps) {
  const heatmapCells = useMemo(() => {
    return contributionDays.map((date, idx) => {
      const colIdx = Math.floor(idx / 7);
      const dayOfWeek = date.getDay();
      const dateString = formatLocalDate(date);
      const isSameYear = date.getFullYear() === calendarYear;
      const count = isSameYear ? (commitCountsByDate[dateString] || 0) : 0;

      return {
        key: `dot-${idx}`,
        colIdx,
        rowIdx: dayOfWeek,
        dateString,
        date,
        count,
        color: getContributionColor(count),
        isSelected: selectedCalendarDate === dateString,
        isPlaceholder: !isSameYear,
      };
    });
  }, [
    contributionDays,
    calendarYear,
    commitCountsByDate,
    selectedCalendarDate,
    formatLocalDate,
    getContributionColor,
  ]);

  return (
    <div
      id="tour-timeline-panel"
      className="animate-fade-slide"
      style={{
        flex: 1,
        minHeight: 0,
        height: "100%",
        padding: "32px",
        overflowY: "auto",
        backgroundColor: "var(--color-bg-default)",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        maxWidth: "1100px",
        margin: "0 auto",
        width: "100%",
      }}>
      <div>
        <h2 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.5px", margin: 0, color: "var(--color-fg-default)" }}>
          Repository Commit Timeline Calendar
        </h2>
        <p style={{ fontSize: "13px", color: "var(--color-fg-muted)", marginTop: "4px" }}>
          A visual overview of commits, merges, and pushes mapped onto a calendar layout.
        </p>
      </div>

      {isTimelineLoading ? (
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "32px", backgroundColor: "var(--color-bg-subtle)", borderRadius: "8px", border: "1px solid var(--color-border-default)" }}>
          <Loader size="sm" label="Reading git history" />
          <span style={{ fontSize: "13px", color: "var(--color-fg-muted)" }}>Reading repository Git history records...</span>
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", flexShrink: 0 }}>
            <style dangerouslySetInnerHTML={{__html: `
              .contribution-square:hover {
                transform: scale(1.2);
                filter: brightness(1.2);
              }
            `}} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-fg-default)" }}>
                  Yearly Commit Activity
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "4px", backgroundColor: "var(--color-bg-active)", padding: "2px", borderRadius: "6px", border: "1px solid var(--color-border-default)" }}>
                  <button
                    className="btn btn-sm"
                    disabled={calendarYear <= repoStartYear}
                    onClick={() => {
                      if (calendarYear > repoStartYear) {
                        setCalendarYear((y) => y - 1);
                      }
                    }}
                    style={{
                      padding: "2px 6px",
                      fontSize: "10px",
                      height: "20px",
                      display: "flex",
                      alignItems: "center",
                      opacity: calendarYear <= repoStartYear ? 0.4 : 1,
                      cursor: calendarYear <= repoStartYear ? "not-allowed" : "pointer"
                    }}
                  >
                   <Tooltip content={calendarYear <= repoStartYear ? "Limit reached (no older commits)" : "Go to previous year commit calendar"} position="top">
                     &lt;
                   </Tooltip>
                  </button>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-fg-default)", minWidth: "36px", textAlign: "center" }}>
                    {calendarYear}
                  </span>
                  <button
                    className="btn btn-sm"
                    disabled={calendarYear >= currentYear}
                    onClick={() => {
                      if (calendarYear < currentYear) {
                        setCalendarYear((y) => y + 1);
                      }
                    }}
                    style={{
                      padding: "2px 6px",
                      fontSize: "10px",
                      height: "20px",
                      display: "flex",
                      alignItems: "center",
                      opacity: calendarYear >= currentYear ? 0.4 : 1,
                      cursor: calendarYear >= currentYear ? "not-allowed" : "pointer"
                    }}
                  >
                   <Tooltip content={calendarYear >= currentYear ? "Limit reached (current year)" : "Go to next year commit calendar"} position="top">
                     &gt;
                   </Tooltip>
                  </button>
                </div>

                <span style={{ fontSize: "12px", color: "var(--color-fg-muted)" }}>
                  ({totalCommitsLastYear} commits)
                </span>
              </div>
              <button
                className="btn btn-sm"
                onClick={() => setIsYearlyCalendarExpanded(!isYearlyCalendarExpanded)}
                style={{ fontSize: "11px", padding: "4px 10px" }}
              >
                {isYearlyCalendarExpanded ? "Hide Calendar" : "Show Calendar"}
              </button>
            </div>

            {isYearlyCalendarExpanded && (
              <>
                <ContributionHeatmap
                  cells={heatmapCells}
                  numCols={Math.ceil(contributionDays.length / 7)}
                  monthLabels={monthLabels}
                  onCellClick={handleSquareClick}
                />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px", borderTop: "1px solid var(--color-border-default)", paddingTop: "12px" }}>
                  <div style={{ fontSize: "11px", color: "var(--color-fg-muted)" }}>
                    Click any cell to load the timeline details for that date.
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--color-fg-muted)" }}>
                    <span>Less</span>
                    <div style={{ width: "10px", height: "10px", borderRadius: "1.5px", backgroundColor: getContributionColor(0) }} />
                    <div style={{ width: "10px", height: "10px", borderRadius: "1.5px", backgroundColor: getContributionColor(1) }} />
                    <div style={{ width: "10px", height: "10px", borderRadius: "1.5px", backgroundColor: getContributionColor(3) }} />
                    <div style={{ width: "10px", height: "10px", borderRadius: "1.5px", backgroundColor: getContributionColor(6) }} />
                    <div style={{ width: "10px", height: "10px", borderRadius: "1.5px", backgroundColor: getContributionColor(10) }} />
                    <span>More</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: "24px", alignItems: "start", flexShrink: 0 }}>

          <div className="card" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    if (calendarMonth === 0) {
                      setCalendarMonth(11);
                      setCalendarYear((y) => y - 1);
                    } else {
                      setCalendarMonth((m) => m - 1);
                    }
                  }}
                  style={{ padding: "4px 8px" }}
                >
                  &lt;
                </button>

                <span style={{ fontSize: "16px", fontWeight: 700, minWidth: "140px", textAlign: "center" }}>
                  {MONTH_NAMES[calendarMonth]} {calendarYear}
                </span>

                <button
                  className="btn btn-sm"
                  onClick={() => {
                    if (calendarMonth === 11) {
                      setCalendarMonth(0);
                      setCalendarYear((y) => y + 1);
                    } else {
                      setCalendarMonth((m) => m + 1);
                    }
                  }}
                  style={{ padding: "4px 8px" }}
                >
                  &gt;
                </button>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <Tooltip content="Jump to the very first commit of the repository" position="top">
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      if (allCommits.length === 0) return;
                      const oldest = allCommits[allCommits.length - 1];
                      if (oldest && oldest.date) {
                        const d = new Date(oldest.date);
                        setCalendarYear(d.getFullYear());
                        setCalendarMonth(d.getMonth());
                        setSelectedCalendarDate(oldest.date);
                      }
                    }}
                    style={{ fontSize: "11px", padding: "4px 10px" }}
                  >
                    Repo Start
                  </button>
                </Tooltip>

                <Tooltip content="Jump to the current month & year calendar view" position="top">
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      const today = new Date();
                      setCalendarYear(today.getFullYear());
                      setCalendarMonth(today.getMonth());
                    }}
                    style={{ fontSize: "11px", padding: "4px 10px" }}
                  >
                    Today
                  </button>
                </Tooltip>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", borderBottom: "1px solid var(--color-border-default)", paddingBottom: "8px" }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
                <div key={dayName} style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-fg-muted)" }}>
                  {dayName}
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "8px", minHeight: "280px" }}>
              {(() => {
                const firstDayIdx = new Date(calendarYear, calendarMonth, 1).getDay();
                const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                const cells = [];

                for (let i = 0; i < firstDayIdx; i++) {
                  cells.push(<div key={`empty-${i}`} style={{ opacity: 0.15 }}></div>);
                }

                for (let day = 1; day <= daysInMonth; day++) {
                  const dateString = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayCommits = allCommits.filter((c) => c.date === dateString);
                  const isSelected = selectedCalendarDate === dateString;
                  const hasCommits = dayCommits.length > 0;
                  const hasMerges = dayCommits.some((c) => c.isMerge);

                  cells.push(
                    <div
                      key={`day-${day}`}
                      onClick={() => setSelectedCalendarDate(dateString)}
                      style={{
                        border: `1px solid ${isSelected ? "var(--color-accent-border)" : "var(--color-border-default)"}`,
                        borderRadius: "6px",
                        padding: "8px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        minHeight: "56px",
                        backgroundColor: isSelected
                          ? "var(--color-accent-bg)"
                          : hasCommits
                          ? "rgba(56, 139, 253, 0.05)"
                          : "var(--color-bg-overlay)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        position: "relative",
                      }}
                    >
                      <span style={{
                        fontSize: "12px",
                        fontWeight: isSelected || hasCommits ? 700 : "normal",
                        color: isSelected
                          ? "var(--color-accent-fg)"
                          : hasCommits
                          ? "var(--color-fg-default)"
                          : "var(--color-fg-muted)",
                      }}>
                        {day}
                      </span>

                      {hasCommits && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
                          <span className={`badge ${hasMerges ? "badge-danger" : "badge-success"}`} style={{ fontSize: "9px", padding: "1px 4px" }}>
                            {dayCommits.length}
                          </span>
                          {hasMerges && <span style={{ fontSize: "9px", color: "var(--color-danger-fg)", fontWeight: "bold" }}>M</span>}
                        </div>
                      )}
                    </div>
                  );
                }

                return cells;
              })()}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="card" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.5px" }}>
                Month Performance stats
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginTop: "4px" }}>
                <span>Total commits this month:</span>
                <strong style={{ color: "var(--color-accent-fg)" }}>
                  {allCommits.filter((c) => {
                    const d = new Date(c.date);
                    return d.getFullYear() === calendarYear && d.getMonth() === calendarMonth;
                  }).length}
                </strong>
              </div>
            </div>

            <div className="card" style={{ padding: "20px", minHeight: "360px", display: "flex", flexDirection: "column" }}>
              <div style={{ borderBottom: "1px solid var(--color-border-default)", paddingBottom: "12px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", color: "var(--color-fg-muted)", letterSpacing: "0.5px" }}>
                  Timeline Activity Details
                </div>
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginTop: "4px", color: "var(--color-fg-default)" }}>
                  {selectedCalendarDate ? (
                    new Date(selectedCalendarDate).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })
                  ) : (
                    "No Date Selected"
                  )}
                </h3>
              </div>

              <div style={{ flex: 1, overflowY: "auto" }}>
                {(() => {
                  if (!selectedCalendarDate) {
                    return (
                      <div
                        style={{
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--color-fg-subtle)",
                          textAlign: "center",
                          fontSize: "12px",
                        }}
                      >
                        No date selected
                      </div>
                    );
                  }

                  const dateCommits = allCommits.filter((c) => c.date === selectedCalendarDate);
                  if (dateCommits.length === 0) {
                    return (
                      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-fg-subtle)", fontStyle: "italic", textAlign: "center", fontSize: "12px" }}>
                        No commits or repository modifications recorded on this date.
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {dateCommits.map((c) => (
                        <div
                          key={c.hash}
                          style={{
                            border: "1px solid var(--color-border-default)",
                            borderRadius: "6px",
                            padding: "12px",
                            backgroundColor: "rgba(22, 27, 34, 0.4)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--color-accent-fg)", fontWeight: 600 }}>
                              {c.hash.slice(0, 7)}
                            </span>
                            {c.isMerge ? (
                              <span className="badge badge-danger" style={{ fontSize: "9px", padding: "1px 4px" }}>Merge</span>
                            ) : (
                              <span className="badge badge-success" style={{ fontSize: "9px", padding: "1px 4px" }}>Commit</span>
                            )}
                          </div>

                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-fg-default)", lineHeight: "18px" }}>
                            {c.subject}
                          </div>

                          <div style={{ fontSize: "11px", color: "var(--color-fg-muted)", display: "flex", justifyContent: "space-between", marginTop: "2px" }}>
                            <span>Author: {c.author}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
