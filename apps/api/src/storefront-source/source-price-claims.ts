import { BadGatewayException } from '@nestjs/common';
import * as ts from 'typescript';
import { parseFragment } from 'parse5';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

const priceRole = /(?:^|[\s_-])(?:price|precio)(?:$|[\s_-])/i;
const money = /(?:\bBs\.?|\bBOB|\bUSD|US\$|\$)\s*\d|\d[\d.,\s]*\s(?:BOB|USD)\b/i;
const numeric = /^\s*\d[\d.,\s]*\s*$/;

/** A narrow structural guard, not arbitrary number replacement. Runtime price fields remain authoritative.
 * Literal prices in explicitly named price slots become stale and are often copied from minor-unit amounts.
 * Ordinary copy (dates, addresses, dimensions, prose and counters) is outside this guard. */
export function validateSourcePriceClaims(files: SourceProjectFileDto[]): void {
  const failures: string[] = [];
  const staticPrice = (role: string, text: string) => priceRole.test(role) && (money.test(text) || numeric.test(text));
  for (const file of files) {
    if (file.path.endsWith('.tsx')) {
      const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const attribute = (opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string) => {
        const attr = opening.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.getText(source) === name) as ts.JsxAttribute | undefined;
        const value = attr?.initializer;
        return value && ts.isStringLiteral(value) ? value.text : value && ts.isJsxExpression(value) && value.expression && ts.isStringLiteral(value.expression) ? value.expression.text : '';
      };
      const rawAmount = (expression?: ts.Expression): boolean => {
        while (expression && ts.isParenthesizedExpression(expression)) expression = expression.expression;
        return !!expression && (ts.isPropertyAccessExpression(expression) && expression.name.text === 'amount'
          || ts.isElementAccessExpression(expression) && ts.isStringLiteral(expression.argumentExpression) && expression.argumentExpression.text === 'amount'
          || ts.isTemplateExpression(expression) && expression.templateSpans.some(span => rawAmount(span.expression)));
      };
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node)) {
          const field = attribute(node.openingElement, 'data-product-field');
          if (field === 'price') return; // The catalog runtime replaces this placeholder.
          const role = attribute(node.openingElement, 'className') + ' ' + attribute(node.openingElement, 'id');
          const text = node.children.map(child => ts.isJsxText(child) ? child.text : ts.isJsxExpression(child) && child.expression && (ts.isStringLiteral(child.expression) || ts.isNumericLiteral(child.expression) || ts.isNoSubstitutionTemplateLiteral(child.expression)) ? child.expression.text : '').join('');
          const unformatted = priceRole.test(role) && node.children.some(child => ts.isJsxExpression(child) && rawAmount(child.expression));
          if (staticPrice(role, text) || unformatted) failures.push(`${file.path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    } else if (file.path.endsWith('.html')) {
      const visit = (node: any) => {
        const attrs = Object.fromEntries((node.attrs || []).map((attr: any) => [attr.name, attr.value]));
        if (attrs['data-product-field'] === 'price') return;
        const text = (node.childNodes || []).filter((child: any) => child.nodeName === '#text').map((child: any) => child.value).join('');
        if (staticPrice(`${attrs.class || ''} ${attrs.id || ''}`, text)) failures.push(file.path);
        for (const child of node.childNodes || []) visit(child);
        if (node.content) visit(node.content);
      };
      visit(parseFragment(file.content));
    }
  }
  if (failures.length) throw new BadGatewayException(`Precios estáticos o importes menores sin formato en ${[...new Set(failures)].join(', ')}. El catálogo y ProductDetail muestran el precio vigente. En historias o destacados omite el precio duplicado y enlaza al producto/catálogo; no copies amount (2000 significa 20,00) ni escribas otro precio manual. Conserva imágenes, nombres y composición.`);
}
