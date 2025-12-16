import { Controller, Post, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { BrokerCheckSyncService } from './brokercheck-sync.service';
import { BrokerCheckSyncResult } from './dto';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('brokercheck-sync')
@Controller('api/brokercheck-sync')
export class BrokerCheckSyncController {
  constructor(private readonly syncService: BrokerCheckSyncService) {}

  @Post('run')
  @Public()
  @ApiOperation({
    summary: 'Manually trigger BrokerCheck sync',
    description:
      'Checks all open introductions against FINRA BrokerCheck to detect new hires at Stirlingshire',
  })
  @ApiResponse({
    status: 200,
    description: 'Sync completed',
  })
  async runSync(): Promise<BrokerCheckSyncResult> {
    return this.syncService.runWeeklySync();
  }

  @Get('status')
  @Public()
  @ApiOperation({
    summary: 'Get BrokerCheck sync status',
    description: 'Returns the current sync status including open introductions and tracked advisors',
  })
  @ApiResponse({
    status: 200,
    description: 'Sync status',
  })
  async getStatus() {
    return this.syncService.getSyncStatus();
  }

  @Get('check/:crd')
  @Public()
  @ApiOperation({
    summary: 'Check a CRD number against BrokerCheck',
    description:
      'Manually verify if a specific CRD is registered at Stirlingshire. Useful for testing.',
  })
  @ApiParam({
    name: 'crd',
    description: 'The CRD number to check',
    example: 5753804,
  })
  @ApiResponse({
    status: 200,
    description: 'Check result',
  })
  async checkCrd(@Param('crd', ParseIntPipe) crd: number) {
    return this.syncService.checkCrd(crd);
  }
}
