import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { GoldReportController } from './gold-report.controller';
import { GoldReportService } from './gold-report.service';

describe('GoldReportController', () => {
  const pdf = Buffer.from('%PDF-1.4 mock-report', 'utf8');
  const reports = {
    generateSnapshotPdf: jest.fn(),
    generateStrategyPdf: jest.fn(),
    parseStrategyRange: jest.fn((range?: string) => range ?? 'ALL'),
  };
  const controller = new GoldReportController(
    reports as unknown as GoldReportService,
  );
  const req = { user: { id: 'user-a' } } as never;
  const res = {
    setHeader: jest.fn(),
    send: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    reports.generateSnapshotPdf.mockResolvedValue({
      buffer: pdf,
      filename: 'Gold-Snapshot-2026-09-05.pdf',
      contentType: 'application/pdf',
    });
    reports.generateStrategyPdf.mockResolvedValue({
      buffer: pdf,
      filename: 'Gold-Strategy-2026-09-05.pdf',
      contentType: 'application/pdf',
    });
    reports.parseStrategyRange.mockImplementation(
      (range?: string) => range ?? 'ALL',
    );
  });

  it('requires JWT auth on the controller', () => {
    const guards = Reflect.getMetadata('__guards__', GoldReportController) as
      | unknown[]
      | undefined;
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));
  });

  it('sends snapshot PDF headers from the authenticated user', async () => {
    await controller.snapshot(req, res as never);
    expect(reports.generateSnapshotPdf).toHaveBeenCalledWith('user-a');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="Gold-Snapshot-2026-09-05.pdf"',
    );
    expect(res.send).toHaveBeenCalledWith(pdf);
  });

  it('sends strategy PDF headers from the authenticated user', async () => {
    await controller.strategy(req, res as never, 'D30');
    expect(reports.parseStrategyRange).toHaveBeenCalledWith('D30');
    expect(reports.generateStrategyPdf).toHaveBeenCalledWith('user-a', 'D30');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="Gold-Strategy-2026-09-05.pdf"',
    );
  });
});
