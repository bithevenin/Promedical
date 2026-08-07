import { Pipe, PipeTransform } from '@angular/core';
import { formatMonto } from '../utils/format.utils';

@Pipe({
  name: 'formatMonto',
  standalone: true
})
export class FormatMontoPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    return formatMonto(value);
  }
}
