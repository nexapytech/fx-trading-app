import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { UsersService } from './user.service';
import { User } from './entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  async register(@Body() body: { username: string; email: string; password: string }) {
    return this.usersService.create(body);
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}