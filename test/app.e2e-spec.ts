import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Stirlingshire-Boardy API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Vendors', () => {
    it('/api/vendors (GET) should return empty array initially', () => {
      return request(app.getHttpServer())
        .get('/api/vendors')
        .expect(200)
        .expect([]);
    });
  });

  describe('Hires', () => {
    it('/api/hires (GET) should return paginated results', () => {
      return request(app.getHttpServer())
        .get('/api/hires')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('data');
          expect(res.body).toHaveProperty('meta');
        });
    });
  });

  describe('Placements', () => {
    it('/api/placements/stats (GET) should return statistics', () => {
      return request(app.getHttpServer())
        .get('/api/placements/stats')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('total');
          expect(res.body).toHaveProperty('last30Days');
        });
    });
  });
});
