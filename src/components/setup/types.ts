export interface DiagnosticScanResult {
  nodeVersion: string;
  npmVersion: string;
  enginesNode: string;
  isNodeCompatible: boolean;
  packageJsonExists: boolean;
  totalDependencies: number;
  missingDependencies: string[];
  gitStatus: string;
}

export interface UIRepository {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  cloneUrl: string;
  private: boolean;
  owner: string;
}

export interface GithubUserDetail {
  avatarUrl: string;
  htmlUrl: string;
  name: string;
  bio: string;
  publicRepos: number;
  login: string;
}
