import { Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FinraSyncService, FinraSyncResult } from './finra-sync.service';
import { Public } from '../common/decorators';

@ApiTags('finra-sync')
@Controller('api/finra-sync')
export class FinraSyncController {
  constructor(private readonly finraSyncService: FinraSyncService) {}

  @Post('run')
  @Public() // Should require internal admin auth in production
  @ApiOperation({
    summary: 'Trigger manual FINRA sync',
    description:
      'Manually triggers the weekly FINRA sync job. Use for testing or catch-up syncs.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sync completed',
    schema: {
      properties: {
        processedCount: { type: 'number' },
        newHires: { type: 'number' },
        terminations: { type: 'number' },
        placementsCreated: { type: 'number' },
        errors: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async runSync(): Promise<FinraSyncResult> {
    return this.finraSyncService.runManualSync();
  }
}
