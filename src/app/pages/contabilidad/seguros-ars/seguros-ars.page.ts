import { Component, OnInit, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CitasService, FacturaSeguro, ReportePagoSeguro } from '../../../services/citas.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

@Component({
    selector: 'app-seguros-ars',
    templateUrl: './seguros-ars.page.html',
    styleUrls: ['./seguros-ars.page.scss'],
    standalone: false,
})
export class SegurosArsPage implements OnInit {
    segurosDisponibles: { value: string; label: string }[] = [{ value: 'todos', label: 'Todos los Seguros' }];

    seguroSeleccionado = signal<string>('todos');
    facturas = signal<FacturaSeguro[]>([]);
    reportes = signal<ReportePagoSeguro[]>([]);
    mostrarSoloPendientes = signal<boolean>(true);
    viewMode = signal<'facturas' | 'pagos'>('facturas');

    // Modal para agregar factura manual
    showAddModal = false;
    nuevaFactura = {
        cedula: '',
        nombrePaciente: '',
        edad: 0,
        carnetSeguro: '',
        seguro: '',
        monto: 500
    };

    // Modales para reportes de pago
    showReporteModal = false;
    showPagoModal = false;
    reporteSeleccionado: ReportePagoSeguro | null = null;

    nuevoReporte = {
        seguro: '',
        mes: new Date().toISOString().substring(0, 7),
        montoEnviado: 0,
        comentario: ''
    };

    nuevoPago = {
        montoRecibido: 0,
        fechaPago: new Date().toISOString().split('T')[0]
    };

    facturasFiltradas = computed(() => {
        let result = this.facturas();

        if (this.seguroSeleccionado() !== 'todos') {
            result = result.filter(f => f.seguro === this.seguroSeleccionado());
        }

        if (this.mostrarSoloPendientes()) {
            result = result.filter(f => f.estado === 'pendiente');
        }

        return result.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    });

    reportesFiltrados = computed(() => {
        let result = this.reportes();

        if (this.seguroSeleccionado() !== 'todos') {
            result = result.filter(r => r.seguro === this.seguroSeleccionado());
        }

        if (this.mostrarSoloPendientes()) {
            result = result.filter(r => r.estado === 'pendiente');
        }

        return result.sort((a, b) => b.mes.localeCompare(a.mes));
    });

    totalMonto = computed(() =>
        this.facturasFiltradas().reduce((sum, f) => sum + f.monto, 0)
    );

    totalEnviadoReportes = computed(() =>
        this.reportesFiltrados().reduce((acc, r) => acc + r.montoEnviado, 0)
    );

    totalRecibidoReportes = computed(() =>
        this.reportesFiltrados().reduce((acc, r) => acc + (r.montoRecibido || 0), 0)
    );

    balanceAcumulado = computed(() => {
        const reportesTarget = this.seguroSeleccionado() === 'todos'
            ? this.reportes()
            : this.reportes().filter(r => r.seguro === this.seguroSeleccionado());

        const totalEnviado = reportesTarget.reduce((acc, r) => acc + r.montoEnviado, 0);
        const totalRecibido = reportesTarget.reduce((acc, r) => acc + (r.montoRecibido || 0), 0);

        return totalEnviado - totalRecibido;
    });

    totalPacientes = computed(() => this.facturasFiltradas().length);

    constructor(
        private citasService: CitasService,
        private router: Router
    ) { }

    ngOnInit() {
        this.citasService.facturasSeguro$.subscribe(facturas => {
            this.facturas.set(facturas);
        });

        this.citasService.reportesPagosSeguro$.subscribe(reportes => {
            this.reportes.set(reportes);
        });

        this.citasService.config$.subscribe(config => {
            this.segurosDisponibles = [
                { value: 'todos', label: 'Todos los Seguros' },
                ...config.tarifasSeguros.map(t => ({ value: t.seguro, label: t.seguro }))
            ];
            if (this.nuevaFactura.seguro === '' && config.tarifasSeguros.length > 0) {
                this.nuevaFactura.seguro = config.tarifasSeguros[0].seguro;
                this.nuevoReporte.seguro = config.tarifasSeguros[0].seguro;
            }
        });
    }

    onViewModeChange(event: any) {
        this.viewMode.set(event.detail.value);
    }

    onSeguroChange(event: any) {
        this.seguroSeleccionado.set(event.target.value);
    }

    togglePendientes() {
        this.mostrarSoloPendientes.set(!this.mostrarSoloPendientes());
    }

    marcarPagada(factura: FacturaSeguro) {
        if (confirm(`¿Confirmar pago de factura de ${factura.nombrePaciente}?`)) {
            this.citasService.marcarFacturaPagada(factura.id);
        }
    }

    volver() {
        this.router.navigate(['/contabilidad']);
    }

    // --- Modal de Agregar Factura ---
    abrirModalAgregar() {
        this.nuevaFactura = {
            cedula: '',
            nombrePaciente: '',
            edad: 0,
            carnetSeguro: '',
            seguro: this.seguroSeleccionado() !== 'todos' ? this.seguroSeleccionado() : (this.segurosDisponibles[1]?.value || 'ARS Humano'),
            monto: 500
        };
        this.showAddModal = true;
    }

    cerrarModal() {
        this.showAddModal = false;
        this.showReporteModal = false;
        this.showPagoModal = false;
    }

    guardarFactura() {
        if (this.nuevaFactura.nombrePaciente && this.nuevaFactura.carnetSeguro) {
            const factura: FacturaSeguro = {
                id: Date.now(),
                cedula: this.nuevaFactura.cedula,
                nombrePaciente: this.nuevaFactura.nombrePaciente,
                edad: this.nuevaFactura.edad,
                carnetSeguro: this.nuevaFactura.carnetSeguro,
                seguro: this.nuevaFactura.seguro,
                fecha: new Date().toISOString().split('T')[0],
                monto: this.nuevaFactura.monto,
                estado: 'pendiente'
            };
            this.citasService.agregarFacturaSeguro(factura);
            this.cerrarModal();
        }
    }

    // --- Métodos para Reportes de Pagos ---
    abrirModalReporte() {
        this.nuevoReporte = {
            seguro: this.seguroSeleccionado() !== 'todos' ? this.seguroSeleccionado() : (this.segurosDisponibles[1]?.value || 'ARS Humano'),
            mes: new Date().toISOString().substring(0, 7),
            montoEnviado: 0,
            comentario: ''
        };
        this.showReporteModal = true;
    }

    guardarReporte() {
        if (this.nuevoReporte.seguro && this.nuevoReporte.montoEnviado > 0) {
            this.citasService.agregarReportePagoSeguro(this.nuevoReporte);
            this.showReporteModal = false;
        }
    }

    abrirModalPago(reporte: ReportePagoSeguro) {
        this.reporteSeleccionado = reporte;
        this.nuevoPago = {
            montoRecibido: reporte.montoEnviado,
            fechaPago: new Date().toISOString().split('T')[0]
        };
        this.showPagoModal = true;
    }

    guardarPago() {
        if (this.reporteSeleccionado && this.nuevoPago.montoRecibido > 0) {
            this.citasService.registrarPagoRecibido(
                this.reporteSeleccionado.id,
                this.nuevoPago.montoRecibido,
                this.nuevoPago.fechaPago
            );
            this.showPagoModal = false;
        }
    }

    // --- Exportación PDF ---
    exportarPDF() {
        const doc = new jsPDF();
        const facturas = this.facturasFiltradas();
        const seguro = this.seguroSeleccionado() === 'todos' ? 'Todos los Seguros' : this.seguroSeleccionado();
        const fecha = new Date().toLocaleDateString();
        const mes = new Date().toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });

        // Título
        doc.setFontSize(18);
        doc.setTextColor(40, 40, 40);
        doc.text('Reporte de Facturación ARS', 14, 22);

        // Subtítulo
        doc.setFontSize(12);
        doc.setTextColor(100);
        doc.text(`${seguro} - ${mes}`, 14, 30);
        doc.text(`Generado: ${fecha}`, 14, 36);

        // Resumen
        doc.setFontSize(11);
        doc.setTextColor(40);
        doc.text(`Total Pacientes: ${this.totalPacientes()}`, 14, 46);
        doc.text(`Total a Cobrar: RD$ ${this.totalMonto().toLocaleString()}`, 14, 52);

        // Tabla
        const tableData = facturas.map(f => [
            f.fecha,
            f.nombrePaciente,
            f.edad.toString(),
            f.carnetSeguro,
            f.seguro,
            `RD$ ${f.monto.toLocaleString()}`,
            f.estado === 'pendiente' ? 'Pendiente' : 'Pagado'
        ]);

        autoTable(doc, {
            startY: 60,
            head: [['Fecha', 'Paciente', 'Edad', 'Carnet', 'Seguro', 'Monto', 'Estado']],
            body: tableData,
            theme: 'striped',
            headStyles: {
                fillColor: [59, 130, 246],
                textColor: 255,
                fontStyle: 'bold'
            },
            styles: {
                fontSize: 9,
                cellPadding: 3
            },
            alternateRowStyles: {
                fillColor: [245, 247, 250]
            }
        });

        // Pie de página con totales
        const finalY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(12);
        doc.setTextColor(40);
        doc.text(`TOTAL A COBRAR: RD$ ${this.totalMonto().toLocaleString()}`, 14, finalY);

        // Guardar
        const fileName = `Reporte_ARS_${seguro.replace(/\s/g, '_')}_${fecha.replace(/\//g, '-')}.pdf`;
        doc.save(fileName);
    }

    // --- Exportación Excel ---
    exportarExcel() {
        const facturas = this.facturasFiltradas();
        const seguro = this.seguroSeleccionado() === 'todos' ? 'Todos_los_Seguros' : this.seguroSeleccionado();
        const fecha = new Date().toLocaleDateString();
        const mes = new Date().toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });

        // Preparar datos
        const wsData = [
            ['REPORTE DE FACTURACIÓN ARS'],
            [`${seguro} - ${mes}`],
            [`Generado: ${fecha}`],
            [],
            [`Total Pacientes: ${this.totalPacientes()}`],
            [`Total a Cobrar: RD$ ${this.totalMonto().toLocaleString()}`],
            [],
            ['Fecha', 'Paciente', 'Edad', 'Cédula', 'Carnet Seguro', 'Seguro', 'Monto (RD$)', 'Estado'],
            ...facturas.map(f => [
                f.fecha,
                f.nombrePaciente,
                f.edad,
                f.cedula,
                f.carnetSeguro,
                f.seguro,
                f.monto,
                f.estado === 'pendiente' ? 'Pendiente' : 'Pagado'
            ]),
            [],
            ['', '', '', '', '', 'TOTAL:', this.totalMonto(), '']
        ];

        // Crear workbook y worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Ajustar anchos de columna
        ws['!cols'] = [
            { wch: 12 },  // Fecha
            { wch: 25 },  // Paciente
            { wch: 8 },   // Edad
            { wch: 15 },  // Cédula
            { wch: 18 },  // Carnet
            { wch: 15 },  // Seguro
            { wch: 12 },  // Monto
            { wch: 12 }   // Estado
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Facturas ARS');

        // Guardar
        const fileName = `Reporte_ARS_${seguro.replace(/\s/g, '_')}_${fecha.replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }
}
