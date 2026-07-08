"use client";

import { useState, useMemo } from "react";
import type { RepoCommit } from "@/types/dashboard";
import { MONTH_NAMES } from "@/types/dashboard";

export function useTimeline() {
  const [allCommits, setAllCommits] = useState<RepoCommit[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [isYearlyCalendarExpanded, setIsYearlyCalendarExpanded] = useState(true);

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const contributionDays = useMemo(() => {
    const days = [];
    const jan1 = new Date(calendarYear, 0, 1);
    const startDayOfWeek = jan1.getDay();
    const start = new Date(jan1);
    start.setDate(jan1.getDate() - startDayOfWeek);

    const dec31 = new Date(calendarYear, 11, 31);
    const endDayOfWeek = dec31.getDay();
    const end = new Date(dec31);
    end.setDate(dec31.getDate() + (6 - endDayOfWeek));

    const curr = new Date(start);
    while (curr <= end) {
      days.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [calendarYear]);

  const commitCountsByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    allCommits.forEach((commit) => {
      if (commit.date) {
        counts[commit.date] = (counts[commit.date] || 0) + 1;
      }
    });
    return counts;
  }, [allCommits]);

  const totalCommitsLastYear = useMemo(() => {
    let total = 0;
    contributionDays.forEach((date) => {
      if (date.getFullYear() === calendarYear) {
        const dateString = formatLocalDate(date);
        total += commitCountsByDate[dateString] || 0;
      }
    });
    return total;
  }, [contributionDays, commitCountsByDate, calendarYear]);

  const monthLabels = useMemo(() => {
    const labels: { text: string; colIdx: number }[] = [];
    let prevMonth = -1;
    const numCols = Math.ceil(contributionDays.length / 7);
    for (let colIdx = 0; colIdx < numCols; colIdx++) {
      const dayIndex = colIdx * 7;
      if (dayIndex < contributionDays.length) {
        const date = contributionDays[dayIndex];
        const month = date.getFullYear() < calendarYear ? 0 : date.getFullYear() > calendarYear ? 11 : date.getMonth();
        if (month !== prevMonth) {
          labels.push({
            text: MONTH_NAMES[month].slice(0, 3),
            colIdx: colIdx,
          });
          prevMonth = month;
        }
      }
    }
    return labels;
  }, [contributionDays, calendarYear]);

  const repoStartYear = useMemo(() => {
    if (allCommits.length === 0) return new Date().getFullYear();
    const oldest = allCommits[allCommits.length - 1];
    if (oldest && oldest.date) {
      const d = new Date(oldest.date);
      if (!isNaN(d.getTime())) {
        return d.getFullYear();
      }
    }
    return new Date().getFullYear();
  }, [allCommits]);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const handleSquareClick = (dateString: string, date: Date) => {
    setSelectedCalendarDate(dateString);
    setCalendarYear(date.getFullYear());
    setCalendarMonth(date.getMonth());
  };

  const getContributionColor = (count: number) => {
    if (count === 0) return "var(--color-bg-active)";
    if (count <= 2) return "#0e4429";
    if (count <= 5) return "#006d32";
    if (count <= 9) return "#26a641";
    return "#39d353";
  };

  const loadAllCommits = async () => {
    setIsTimelineLoading(true);
    try {
      const res = await fetch("/api/workspace/git?action=all-commits");
      const data = await res.json();
      setAllCommits((data.commits as RepoCommit[]) || []);
    } catch {} finally {
      setIsTimelineLoading(false);
    }
  };

  return {
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
    loadAllCommits,
  };
}
