import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { APPS } from '../config/apps.config';

@Injectable()
export class ApiKeyGaurd implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const key = context.switchToHttp().getRequest().headers['x-api-key'];
    const found = Object.values(APPS).some((a) => a.key === key);
    if (!found) throw new UnauthorizedException('Bad API key');
    return true;
  }
}
