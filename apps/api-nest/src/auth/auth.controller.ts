import { Controller, Post, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';

@Controller('api/v1/auth')
export class AuthController {
  @Post('register')
  register() {
    return { message: 'User registered successfully', userId: 'mock-user-123' };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Res({ passthrough: true }) res: Response) {
    res.cookie('refresh_token', 'mock-refresh-token-xyz', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    return { accessToken: 'mock-access-token-abc', expiresIn: 900 };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh() {
    return { accessToken: 'mock-access-token-new', expiresIn: 900 };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refresh_token');
    return { message: 'Logged out successfully' };
  }
}
