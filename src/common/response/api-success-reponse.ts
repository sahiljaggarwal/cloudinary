export class ApiSuccessResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  meta?: any;

  constructor(
    success: boolean,
    statusCode: number,
    message: string,
    data?: T,
    meta?: any,
  ) {
    this.success = success;
    this.message = message;
    this.statusCode = statusCode;
    this.data = data;
    this.meta = meta;
  }
}
