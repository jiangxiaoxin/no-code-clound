import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthPrincipal } from '../admin/permissions';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from 'src/common/decorator/roles.decorator';


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  profile(@Req() req: { user: AuthPrincipal }) {
    return req.user;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  logout(@Req() req: { headers: { authorization?: string } }) {
    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    return this.authService.logout(token);
  }

  @Get('test/:id')
  @UseGuards(RolesGuard)
  @Roles(['admin', 'user', 'guest'])
  test(@Param('id') id: string, @Query('name') name: string, @Query('age') age: number, @Body() body: any) {
    console.log('=====test');
    console.log('id', id); // 从url 里取参数
    console.log('name', name); // 从url 的query 里取参数
    console.log('age', age);
    console.log('body', body); // 从 body 里取参数
    
    console.log('=====test end');
    return {
      message: 'test role guard'
    }
  }
}
