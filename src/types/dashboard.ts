export interface RepoCommit {
  hash: string;
  author: string;
  email?: string;
  date: string;
  authoredAt?: string;
  subject: string;
  isMerge: boolean;
  branches?: string[];
}

export interface DiagnosticDependency {
  name: string;
  version: string;
  installed: boolean;
}

export interface DiagnosticRelease {
  tagName: string;
  name: string;
  publishedAt: string;
  prerelease: boolean;
  htmlUrl: string;
}

export interface DiagnosticDeployment {
  id: number;
  environment: string;
  description: string;
  createdAt: string;
  state: string;
  url?: string;
}

export interface DiagnosticDetails {
  nodeVersion: string;
  npmVersion: string;
  enginesNode: string;
  isNodeCompatible: boolean;
  packageJsonExists: boolean;
  totalDependencies: number;
  missingDependencies: string[];
  dependencies?: DiagnosticDependency[];
  nodeModulesExists?: boolean;
  gitStatus: string;
  projectName?: string;
  projectVersion?: string;
  projectDescription?: string;
  projectLicense?: string;
  username?: string;
  hostname?: string;
  folderName?: string;
  releases?: DiagnosticRelease[];
  deployments?: DiagnosticDeployment[];
}

export type DashboardTab = "workspace" | "git" | "diagnostics" | "settings" | "timeline";

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
