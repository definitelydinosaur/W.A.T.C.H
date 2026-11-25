import { Controller, Get } from '@nestjs/common';
import { execFileSync } from 'node:child_process';

function getGitCommit() {
  const configured =
    process.env.RENDER_GIT_COMMIT ??
    process.env.GIT_COMMIT ??
    process.env.SOURCE_COMMIT;
  if (configured) return configured;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      timeout: 1000,
    }).trim();
  } catch {
    return 'unknown';
  }
}

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      git_commit: getGitCommit(),
      build_time:
        process.env.BUILD_TIME ??
        process.env.RENDER_DEPLOY_CREATED_AT ??
        'unknown',
    };
  }
}
