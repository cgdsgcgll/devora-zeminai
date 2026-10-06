export function deploymentConfig(
  env: Record<string, string | undefined>,
  productionBuild?: boolean,
): { backend: string; production: boolean };
