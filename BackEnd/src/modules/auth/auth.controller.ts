import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  ChallengeRequestDto,
  ChallengeResponseDto,
  LoginDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a sign-in challenge for a Stellar address' })
  @ApiResponse({ status: 200, type: ChallengeResponseDto })
  async challenge(
    @Body() dto: ChallengeRequestDto,
  ): Promise<ChallengeResponseDto> {
    return this.authService.generateChallenge(dto.stellarAddress);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with a signed Stellar challenge' })
  async login(@Body() loginDto: LoginDto, @Res() res: Response) {
    const result = await this.authService.verifyAndLogin(loginDto);

    return res.json(result);
  }
}
