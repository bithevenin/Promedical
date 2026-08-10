import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CierreTurnoPage } from './cierre-turno.page';

describe('CierreTurnoPage', () => {
  let component: CierreTurnoPage;
  let fixture: ComponentFixture<CierreTurnoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CierreTurnoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
