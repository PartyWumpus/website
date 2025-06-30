#import "@preview/zebraw:0.5.5": zebraw, zebraw-themes

#let template(
  title: none,
  desc: none,
  date: none,
  doc
) = [
  #show math.equation: html.frame
  #show: zebraw.with(
    background-color:  rgb("#24292e"),
    inset: (top: 0pt, bottom: 0pt),
    lang: false,
    extend: false,
    numbering: false,
  )
  #set text(white)

  #metadata((
    title: title,
    description: desc,
    pubDate: date,
  ))<frontmatter>
  #doc
]
