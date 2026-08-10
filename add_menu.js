const fs = require('fs');
const path = require('path');

const files = [
  'src/app/pages/pacientes/pacientes.page.ts',
  'src/app/pages/dashboard/dashboard.page.ts',
  'src/app/pages/contabilidad/seguros-ars/seguros-ars.page.ts',
  'src/app/pages/contabilidad/contabilidad.page.ts',
  'src/app/pages/consulta/consulta.page.ts',
  'src/app/pages/configuracion/configuracion.page.ts',
  'src/app/pages/citas/citas.page.ts'
];

const workspacePath = 'c:/Users/Yer Perez/Desktop/Promedical';

files.forEach(file => {
  const fullPath = path.join(workspacePath, file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    // Regex matches the spaces before return base;
    content = content.replace(/([ \t]+)return base;/, `$1if (this.currentProfile()?.rol === 'secretaria' || this.currentProfile()?.rol === 'admin') {$1  base.push({ icon: 'lock-closed-outline', label: 'Turno', route: '/cierre-turno' });$1}$1return base;`);
    fs.writeFileSync(fullPath, content);
    console.log('Updated', file);
  } else {
    console.log('Not found', file);
  }
});
