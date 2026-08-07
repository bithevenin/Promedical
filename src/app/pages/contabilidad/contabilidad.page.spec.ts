import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ContabilidadPage } from './contabilidad.page';

describe('ContabilidadPage', () => {
  let component: ContabilidadPage;
  let fixture: ComponentFixture<ContabilidadPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ContabilidadPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
