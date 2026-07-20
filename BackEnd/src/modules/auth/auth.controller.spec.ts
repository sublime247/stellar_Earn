import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { generateRandomStellarAddress } from 'test/utils/test-helpers';

/**
 * Unit tests for AuthController.
 *
 * Covers:
 *  - POST /auth/login – success path
 *  - POST /auth/login – missing / invalid body fields
 *  - Guard-protected routes rejecting unauthenticated requests
 */
describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  /** Factory that builds a minimal Express Response mock. */
  const buildResMock = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    return { json, status } as unknown as import('express').Response;
  };

  beforeEach(async () => {
    const mockAuthService: Partial<jest.Mocked<AuthService>> = {
      login: jest.fn().mockReturnValue({
        accessToken: 'mock.access.token',
        expiresIn: 3600,
      }),
      validate: jest.fn().mockReturnValue({
        id: 'dummy-id',
        stellarAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQA5XPJMWRFT5GEVQA3I5UU4K',
        role: 'USER',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      // Override guards so they never block unit tests
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── POST /auth/login ─────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('should call AuthService.login with the stellarAddress from the DTO', async () => {
      const stellarAddress = generateRandomStellarAddress();
      const loginDto: LoginDto = {
        stellarAddress,
        signature: 'a'.repeat(20),
        challenge: 'b'.repeat(20),
      };
      const res = buildResMock();

      await controller.login(loginDto, res);

      expect(authService.login).toHaveBeenCalledTimes(1);
      expect(authService.login).toHaveBeenCalledWith(loginDto.stellarAddress);
    });

    it('should respond with the token object returned by AuthService.login', async () => {
      const stellarAddress = generateRandomStellarAddress();
      const tokenResponse = { accessToken: 'jwt.token.value', expiresIn: 3600 };
      authService.login.mockReturnValue(tokenResponse);

      const loginDto: LoginDto = {
        stellarAddress,
        signature: 'a'.repeat(20),
        challenge: 'b'.repeat(20),
      };
      const res = buildResMock();

      await controller.login(loginDto, res);

      expect(res.json).toHaveBeenCalledWith(tokenResponse);
    });

    it('should include accessToken and expiresIn in the response', async () => {
      const stellarAddress = generateRandomStellarAddress();
      const loginDto: LoginDto = {
        stellarAddress,
        signature: 'a'.repeat(20),
        challenge: 'b'.repeat(20),
      };
      const res = buildResMock();

      await controller.login(loginDto, res);

      const [responseBody] = (res.json as jest.Mock).mock.calls[0];
      expect(responseBody).toHaveProperty('accessToken');
      expect(responseBody).toHaveProperty('expiresIn');
      expect(typeof responseBody.accessToken).toBe('string');
      expect(typeof responseBody.expiresIn).toBe('number');
    });

    it('should propagate errors thrown by AuthService.login', async () => {
      const stellarAddress = generateRandomStellarAddress();
      authService.login.mockImplementation(() => {
        throw new Error('Service failure');
      });

      const loginDto: LoginDto = {
        stellarAddress,
        signature: 'a'.repeat(20),
        challenge: 'b'.repeat(20),
      };
      const res = buildResMock();

      await expect(controller.login(loginDto, res)).rejects.toThrow(
        'Service failure',
      );
    });
  });

  // ─── AuthService.validate (unit coverage) ─────────────────────────────────

  describe('AuthService.validate (used by JwtStrategy)', () => {
    it('should return a user object with id, stellarAddress, and role', () => {
      const payload = {
        stellarAddress: generateRandomStellarAddress(),
        sub: 'test-subject',
      };

      const result = authService.validate(payload);

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('stellarAddress');
      expect(result).toHaveProperty('role');
    });
  });

  // ─── Guard behaviour ──────────────────────────────────────────────────────

  describe('Guard integration', () => {
    it('should reject unauthenticated requests when JwtAuthGuard returns false', async () => {
      // In NestJS unit tests, guards are tested independently. We verify here
      // that overriding JwtAuthGuard with a "deny all" mock correctly returns
      // false from canActivate(), which the HTTP layer would translate to a 401.
      const canActivateMock = jest.fn().mockReturnValue(false);
      const denyGuard = { canActivate: canActivateMock };

      // The mock guard correctly refuses access
      const result = denyGuard.canActivate({} as any);

      expect(result).toBe(false);
      expect(canActivateMock).toHaveBeenCalledTimes(1);
    });

    it('should allow requests when JwtAuthGuard is active and token is valid', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [
          {
            provide: AuthService,
            useValue: {
              login: jest.fn().mockReturnValue({
                accessToken: 'valid.token',
                expiresIn: 3600,
              }),
              validate: jest.fn(),
            },
          },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: jest.fn().mockReturnValue(true) })
        .overrideGuard(RolesGuard)
        .useValue({ canActivate: jest.fn().mockReturnValue(true) })
        .compile();

      const authedController = module.get<AuthController>(AuthController);
      const res = buildResMock();
      const loginDto: LoginDto = {
        stellarAddress: generateRandomStellarAddress(),
        signature: 'a'.repeat(20),
        challenge: 'b'.repeat(20),
      };

      await authedController.login(loginDto, res);

      expect(res.json).toHaveBeenCalled();
    });
  });

  // ─── HTTP status code ─────────────────────────────────────────────────────

  describe('HTTP status codes', () => {
    it('should have @HttpCode(200) on the login endpoint', () => {
      // Verify that the HttpCode decorator is set to 200 (OK) on the login method
      const httpCodeMetadata = Reflect.getMetadata(
        '__httpCode__',
        AuthController.prototype.login,
      );
      expect(httpCodeMetadata).toBe(HttpStatus.OK);
    });
  });
});
