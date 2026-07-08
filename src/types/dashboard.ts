export interface RepoCommit {
  hash: string;
  author: string;
  date: string;
  subject: string;
  isMerge: boolean;
}

export interface DiagnosticDetails {
  nodeVersion: string;
  npmVersion: string;
  enginesNode: string;
  isNodeCompatible: boolean;
  packageJsonExists: boolean;
  totalDependencies: number;
  missingDependencies: string[];
  gitStatus: string;
  projectName?: string;
  projectVersion?: string;
  projectDescription?: string;
  projectLicense?: string;
  username?: string;
  hostname?: string;
  folderName?: string;
}

export type DashboardTab = "workspace" | "git" | "diagnostics" | "settings" | "timeline";

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
