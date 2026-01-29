import { Component, OnInit, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CitasService, Transaccion } from '../../services/citas.service';

@Component({
  selector: 'app-contabilidad',
  templateUrl: './contabilidad.page.html',
  styleUrls: ['./contabilidad.page.scss'],
  standalone: false,
})
export class ContabilidadPage implements OnInit {

  transactions = signal<Transaccion[]>([]);
  resumenSeguros = signal<{ seguro: string; totalPendiente: number; totalFacturas: number }[]>([]);

  // Modales
  showIngresoModal = false;
  showEgresoModal = false;

  // Formularios
  nuevoIngreso = {
    concepto: '',
    monto: 0,
    paciente: ''
  };

  nuevoEgreso = {
    concepto: '',
    monto: 0,
    categoria: 'Operativo' // Operativo, Suministros, Mantenimiento, Otros
  };

  categoriasEgreso = [
    'Operativo',
    'Suministros',
    'Mantenimiento',
    'Servicios',
    'Alquiler',
    'Salarios',
    'Otros'
  ];

  totalIngresos = computed(() =>
    this.transactions()
      .filter(t => t.categoria === 'Ingreso')
      .reduce((sum, t) => sum + t.monto, 0)
  );

  totalGastos = computed(() =>
    this.transactions()
      .filter(t => t.categoria === 'Gasto')
      .reduce((sum, t) => sum + t.monto, 0)
  );

  balanceNeto = computed(() => this.totalIngresos() - this.totalGastos());

  constructor(
    private citasService: CitasService,
    private router: Router
  ) { }

  ngOnInit() {
    this.citasService.transactions$.subscribe(data => {
      this.transactions.set(data.slice().reverse()); // Mostrar más recientes primero
    });

    // Cargar resumen de seguros
    this.citasService.facturasSeguro$.subscribe(() => {
      this.resumenSeguros.set(this.citasService.getResumenSeguros());
    });
  }

  verReporteSeguros() {
    this.router.navigate(['/contabilidad/seguros']);
  }

  // --- Modal Ingreso ---
  abrirModalIngreso() {
    this.nuevoIngreso = { concepto: '', monto: 0, paciente: '' };
    this.showIngresoModal = true;
  }

  cerrarModalIngreso() {
    this.showIngresoModal = false;
  }

  guardarIngreso() {
    if (this.nuevoIngreso.concepto && this.nuevoIngreso.monto > 0) {
      const transaccion: Transaccion = {
        id: Date.now(),
        fecha: new Date().toLocaleDateString(),
        concepto: this.nuevoIngreso.concepto,
        categoria: 'Ingreso',
        monto: this.nuevoIngreso.monto,
        paciente: this.nuevoIngreso.paciente || undefined
      };
      this.citasService.agregarTransaccion(transaccion);
      this.cerrarModalIngreso();
    }
  }

  // --- Modal Egreso ---
  abrirModalEgreso() {
    this.nuevoEgreso = { concepto: '', monto: 0, categoria: 'Operativo' };
    this.showEgresoModal = true;
  }

  cerrarModalEgreso() {
    this.showEgresoModal = false;
  }

  guardarEgreso() {
    if (this.nuevoEgreso.concepto && this.nuevoEgreso.monto > 0) {
      const transaccion: Transaccion = {
        id: Date.now(),
        fecha: new Date().toLocaleDateString(),
        concepto: `${this.nuevoEgreso.categoria}: ${this.nuevoEgreso.concepto}`,
        categoria: 'Gasto',
        monto: this.nuevoEgreso.monto
      };
      this.citasService.agregarTransaccion(transaccion);
      this.cerrarModalEgreso();
    }
  }
}


