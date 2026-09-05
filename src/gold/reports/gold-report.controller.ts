import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtUser } from '../../auth/jwt.strategy';
import { GoldReportService } from './gold-report.service';

@Controller('gold/reports')
@UseGuards(JwtAuthGuard)
export class GoldReportController {
  constructor(private readonly goldReportService: GoldReportService) {}

  @Get('snapshot.pdf')
  async snapshot(
    @Req() req: Request & { user: JwtUser },
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.goldReportService.generateSnapshotPdf(req.user.id);
    this.sendPdf(res, file.filename, file.buffer);
  }

  @Get('strategy.pdf')
  async strategy(
    @Req() req: Request & { user: JwtUser },
    @Res() res: Response,
    @Query('range') range?: string,
  ): Promise<void> {
    const parsed = this.goldReportService.parseStrategyRange(range);
    const file = await this.goldReportService.generateStrategyPdf(
      req.user.id,
      parsed,
    );
    this.sendPdf(res, file.filename, file.buffer);
  }

  private sendPdf(res: Response, filename: string, buffer: Buffer): void {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  }
}
