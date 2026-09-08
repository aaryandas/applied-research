"""Original Applied Research scenes; all geometry and choreography authored locally."""
import math
import numpy as np
from manim import (Scene, Text, VGroup, Line, Arrow, Dot, Polygon, Rectangle,
                   NumberPlane, UpdateFromAlphaFunc, Transform, linear, LEFT)

INK = '#eceae4'
MUTED = '#a9b1b8'
COOL = '#7bc7c9'
GREEN = '#a7ce9a'
WARM = '#fbd094'
GRID = '#303c45'


def text(content, x, y, size=24, color=INK, width=5.3):
    # Text is Pango plain text, never MarkupText/Tex; input labels are allowlisted.
    result = Text(content, font='DejaVu Sans', font_size=size, color=color)
    if result.width > width:
        result.scale_to_fit_width(width)
    result.move_to([x, y, 0], aligned_edge=LEFT)
    return result


def number(value):
    rounded = round(float(value), 3)
    return f'{rounded:g}' if abs(value - rounded) < 1e-8 else f'~{rounded:g}'


def coords(vector):
    return f'({number(vector[0])}, {number(vector[1])})'


def arrow(start, end, color):
    if np.linalg.norm(end - start) < 1e-7:
        return Dot(end, radius=0.055, color=color)
    return Arrow(start, end, buff=0, color=color, stroke_width=4, max_tip_length_to_length_ratio=0.18)


class RecipeScene(Scene):
    def __init__(self, recipe, **kwargs):
        self.recipe = recipe
        super().__init__(**kwargs)

    def heading(self, subtitle):
        self.add(text(self.recipe['title'], -6.5, 3.45, size=32, width=12.7))
        self.stage = text(subtitle, -6.5, 2.82, size=21, color=MUTED, width=12.7)
        self.add(self.stage)
        self.add(Line([-6.5, 2.43, 0], [6.5, 2.43, 0], color=GRID))
        self.add(text('Applied Research  /  original recipe v1  /  model units', -6.5, -3.55, size=15, color=MUTED, width=12.7))

    def stage_label(self, content):
        replacement = text(content, -6.5, 2.82, size=21, color=MUTED, width=12.7)
        self.remove(self.stage)
        self.stage = replacement
        self.add(self.stage)

    def plane(self, values):
        extent = max(2, math.ceil(max(abs(float(n)) for vector in values for n in vector) * 1.18))
        step = max(1, math.ceil(extent / 4))
        plane = NumberPlane(x_range=[-extent, extent, step], y_range=[-extent, extent, step],
                            x_length=5.1, y_length=5.1, axis_config={'color': MUTED, 'include_ticks': False},
                            background_line_style={'stroke_color': GRID, 'stroke_width': 1, 'stroke_opacity': 0.65})
        plane.move_to([-3.65, -0.38, 0])
        self.add(plane)
        self.add(text('x', -1.00, -0.39, 17, MUTED), text('y', -3.57, 2.21, 17, MUTED))
        self.add(text(f'Grid spacing: {step}  |  origin (0, 0)', -6.2, -3.12, 16, MUTED))
        return plane

    def construct(self):
        if self.recipe['recipe'] == 'linear-transform':
            self.linear_transform()
        else:
            self.weighted_combination()

    def linear_transform(self):
        self.heading('1 / Read the inputs  -  basis, unit square and sample vector')
        p = self.recipe['parameters']
        matrix = np.array(p['matrix'], dtype=float)
        vector = np.array(p['vector'], dtype=float)
        corners = [np.array(v, dtype=float) for v in [[0, 0], [1, 0], [1, 1], [0, 1]]]
        result = matrix @ vector
        plane = self.plane(corners + [matrix @ v for v in corners] + [vector, result])
        origin = plane.c2p(0, 0)
        ghost = Polygon(*[plane.c2p(*v) for v in corners], color=MUTED, fill_opacity=0, stroke_opacity=0.35)
        self.add(ghost)

        def geometry(alpha):
            interpolated = (1 - alpha) * np.identity(2) + alpha * matrix
            square = Polygon(*[plane.c2p(*(interpolated @ v)) for v in corners], color=COOL, fill_color=COOL, fill_opacity=0.12, stroke_width=2)
            return VGroup(square, arrow(origin, plane.c2p(*(interpolated @ [1, 0])), COOL),
                          arrow(origin, plane.c2p(*(interpolated @ [0, 1])), GREEN),
                          arrow(origin, plane.c2p(*(interpolated @ vector)), WARM))

        moving = geometry(0)
        self.add(moving)
        a, b = matrix[0]
        c, d = matrix[1]
        self.add(text('Matrix A', 0.1, 1.96, 22, MUTED))
        self.add(text(f'[ {number(a)}    {number(b)} ]', 0.1, 1.37, 29), text(f'[ {number(c)}    {number(d)} ]', 0.1, 0.82, 29))
        self.add(text(f'Sample v = {coords(vector)}', 0.1, 0.07, 25, WARM))
        basis = VGroup(text('Basis x: (1, 0)', 0.1, -0.57, 21, COOL), text('Basis y: (0, 1)', 0.1, -1.05, 21, GREEN))
        self.add(basis)
        self.wait(2)
        self.stage_label('2 / Transform continuously  -  every point follows the same map')
        self.play(UpdateFromAlphaFunc(moving, lambda mob, alpha: mob.become(geometry(alpha))), run_time=3, rate_func=linear)
        self.stage_label('3 / Read the endpoint  -  multiply each row by the input vector')
        self.remove(basis)
        self.add(text(f'Basis x -> {coords(matrix[:, 0])}', 0.1, -0.57, 21, COOL), text(f'Basis y -> {coords(matrix[:, 1])}', 0.1, -1.05, 21, GREEN))
        self.add(text(f'A v = {coords(result)}', 0.1, -1.77, 29, WARM))
        self.add(text(f'x: {number(a)} x {number(vector[0])} + {number(b)} x {number(vector[1])}', 0.1, -2.38, 19, MUTED),
                 text(f'y: {number(c)} x {number(vector[0])} + {number(d)} x {number(vector[1])}', 0.1, -2.78, 19, MUTED))
        self.wait(5)

    def weighted_combination(self):
        self.heading('1 / Read the weights  -  nonnegative, with a positive total')
        p = self.recipe['parameters']
        a, b = [np.array(v, dtype=float) for v in p['vectors']]
        u, v = p['weights']
        total = u + v
        first, second = u / total, v / total
        result = first * a + second * b
        plane = self.plane([a, b, result])
        origin = plane.c2p(0, 0)
        inputs = VGroup(arrow(origin, plane.c2p(*a), COOL), arrow(origin, plane.c2p(*b), GREEN))
        self.add(inputs)
        self.add(text(f'{p["labels"][0]} = {coords(a)}', 0.1, 1.93, 23, COOL), text(f'{p["labels"][1]} = {coords(b)}', 0.1, 1.36, 23, GREEN))
        self.add(text(f'Raw weights: {number(u)}, {number(v)}', 0.1, 0.62, 23), text(f'Total: {number(u)} + {number(v)} = {number(total)}', 0.1, 0.08, 23))
        self.wait(2)
        self.stage_label('2 / Normalize the weights  -  divide each weight by the total')
        self.add(text(f'{number(u)} / {number(total)} = {number(first)}', 0.1, -0.61, 23, COOL), text(f'{number(v)} / {number(total)} = {number(second)}', 0.1, -1.13, 23, GREEN))
        self.add(text('Normalized shares sum to 1', 0.1, -1.72, 20, MUTED))
        # The bar encodes exact shares; a zero share has no colored area.
        self.add(Rectangle(width=5.3, height=0.2, stroke_color=MUTED).move_to([2.75, -2.25, 0]))
        for start, share, color in [(0, first, COOL), (first, second, GREEN)]:
            if share > 0:
                self.add(Rectangle(width=5.3 * share, height=0.2, stroke_width=0, fill_color=color, fill_opacity=1).move_to([0.1 + 5.3 * (start + share / 2), -2.25, 0]))
        self.play(UpdateFromAlphaFunc(inputs, lambda mob, alpha: mob.become(VGroup(
            arrow(origin, plane.c2p(*((1 - alpha + alpha * first) * a)), COOL),
            arrow(origin, plane.c2p(*((1 - alpha + alpha * second) * b)), GREEN)))), run_time=2, rate_func=linear)
        self.wait(1)
        self.stage_label('3 / Combine the vectors  -  place the scaled arrows head to tail')
        self.play(Transform(inputs[1], arrow(plane.c2p(*(first * a)), plane.c2p(*result), GREEN)), run_time=2, rate_func=linear)
        self.add(arrow(origin, plane.c2p(*result), WARM))
        self.wait(1)
        self.stage_label('4 / Read the result  -  the weighted vector joins origin to endpoint')
        self.add(text(f'Result = {coords(result)}', 0.1, -2.87, 27, WARM))
        self.wait(2)
